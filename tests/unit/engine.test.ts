import { describe, expect, it } from 'vitest';
import { NudgeEngine } from '../../windows/sensor/nudgeEngine';
import type { CheckResults } from '../../windows/sensor/checks/evaluate';
import { CheckEvaluator } from '../../windows/sensor/checks/evaluate';
import { CHECKS } from '../../windows/sensor/checks';
import type { CheckContext } from '../../windows/sensor/checks/types';
import type { CheckId } from '../../shared/types';
import { DEFAULT_SETTINGS } from '../../shared/types';

function results(issues: Partial<Record<CheckId, string>>): CheckResults {
  const r = {} as CheckResults;
  for (const id of ['facing', 'light', 'distance', 'pace', 'occlusion', 'phrase'] as CheckId[]) {
    r[id] = issues[id] ? { status: 'issue', message: issues[id]! } : { status: 'ok', message: '' };
  }
  return r;
}

/** Drive the engine at 10 Hz through a script of [fromMs, toMs, issues]. */
function drive(script: [number, number, Partial<Record<CheckId, string>>][], tracked = (_t: number) => true) {
  const e = new NudgeEngine();
  const end = Math.max(...script.map((s) => s[1]));
  for (let t = 0; t <= end; t += 100) {
    const seg = script.find(([a, b]) => t >= a && t < b);
    e.update(t, results(seg ? seg[2] : {}), tracked(t));
  }
  return e.events;
}

describe('nudge engine', () => {
  it('shows only one nudge, the highest priority', () => {
    const ev = drive([[0, 3000, { pace: 'Slow down a little', facing: 'Face the camera while you talk', light: 'Light is behind you' }]]);
    const n = ev.filter((x) => x.type === 'nudge');
    expect(n.map((x) => x.type === 'nudge' && x.check)).toEqual(['facing']);
  });

  it('clears after 2 s of good state', () => {
    const ev = drive([[0, 1000, { facing: 'x' }], [1000, 6000, {}]]);
    const c = ev.find((x) => x.type === 'clear')!;
    expect(c.t).toBe(2900); // last issue tick at 900 ms + 2 s
  });

  it('allows at most one new nudge per 5 s', () => {
    // facing for 0.5 s, clears at 2.4 s; light appears at 3 s -> must wait until 5 s
    const ev = drive([[0, 500, { facing: 'f' }], [500, 3000, {}], [3000, 9000, { light: 'l' }]]);
    const n = ev.filter((x) => x.type === 'nudge');
    expect(n.map((x) => x.t)).toEqual([0, 5000]);
  });

  it('does not repeat the same nudge within 30 s', () => {
    const ev = drive([
      [0, 1000, { facing: 'f' }],
      [1000, 8000, {}],
      [8000, 12_000, { facing: 'f' }], // too soon: suppressed
      [12_000, 31_000, {}],
      [31_000, 33_000, { facing: 'f' }], // after 30 s: allowed
    ]);
    const n = ev.filter((x) => x.type === 'nudge');
    expect(n.map((x) => x.t)).toEqual([0, 31_000]);
    expect(ev.some((x) => x.type === 'suppressed' && x.reason === 'repeat')).toBe(true);
  });

  it('repeats sooner when the previous nudge lasted more than 10 s', () => {
    const ev = drive([
      [0, 11_000, { facing: 'f' }],
      [11_000, 14_000, {}], // clears at ~12.9 s
      [20_000, 22_000, { facing: 'f' }], // 20 s after the first started; allowed because it lasted > 10 s
    ]);
    const n = ev.filter((x) => x.type === 'nudge');
    expect(n.map((x) => x.t)).toEqual([0, 20_000]);
  });

  it('drops the nudge at once when tracking is lost', () => {
    const ev = drive([[0, 5000, { facing: 'f' }]], (t) => t < 2000);
    const c = ev.find((x) => x.type === 'clear')!;
    expect(c.t).toBe(2000);
    expect(c.type === 'clear' && c.reason).toBe('untracked');
  });

  it('a higher-priority issue replaces a lower one, respecting the 5 s limit', () => {
    const ev = drive([[0, 3000, { pace: 'p' }], [3000, 9000, { pace: 'p', facing: 'f' }]]);
    const n = ev.filter((x) => x.type === 'nudge');
    expect(n.map((x) => x.type === 'nudge' && [x.check, x.t])).toEqual([
      ['pace', 0],
      ['facing', 5000],
    ]);
  });
});

function ctx(over: Partial<CheckContext>): CheckContext {
  return {
    now: 0,
    speaking: true,
    tracked: true,
    sensitivity: 'normal',
    baseline: null,
    yawDeg: 0,
    mouthWidth: 0.08,
    backlightRatio: 1.1,
    faceLum: 140,
    mouthLumRatio: null,
    paceRate: null,
    peakHeight: null,
    talkRunMs: null,
    landmarkReset: false,
    code: () => false,
    ...over,
  };
}

describe('checks and evaluator', () => {
  it('unknown inputs produce unknown, never issue', () => {
    const ev = new CheckEvaluator(CHECKS);
    const r = ev.evaluate(
      ctx({ yawDeg: null, mouthWidth: null, backlightRatio: null, faceLum: null }),
      DEFAULT_SETTINGS.checks,
    );
    expect(r.facing.status).toBe('ok'); // FACE_NOT_FORWARD is known (false)
    expect(r.pace.status).toBe('unknown');
    expect(r.occlusion.status).toBe('unknown');
    for (const id of Object.keys(r) as CheckId[]) expect(r[id].status).not.toBe('issue');
  });

  it('nothing is judged while not speaking', () => {
    const ev = new CheckEvaluator(CHECKS);
    for (let t = 0; t < 5000; t += 100) {
      const r = ev.evaluate(ctx({ now: t, speaking: false, yawDeg: 45 }), DEFAULT_SETTINGS.checks);
      expect(r.facing.status).toBe('unknown');
    }
  });

  it('yaw must be held 1 s while speaking; a short pause keeps the hold, a long one resets it', () => {
    const ev = new CheckEvaluator(CHECKS);
    let r = ev.evaluate(ctx({ now: 0, yawDeg: 30 }), DEFAULT_SETTINGS.checks);
    r = ev.evaluate(ctx({ now: 900, yawDeg: 30 }), DEFAULT_SETTINGS.checks);
    expect(r.facing.status).toBe('ok');
    // a breath between phrases: nothing is judged during it, but the hold survives
    r = ev.evaluate(ctx({ now: 950, yawDeg: 30, speaking: false }), DEFAULT_SETTINGS.checks);
    expect(r.facing.status).toBe('unknown');
    r = ev.evaluate(ctx({ now: 1100, yawDeg: 30 }), DEFAULT_SETTINGS.checks);
    expect(r.facing.status).toBe('issue');
    // a long silence (listening) resets it
    const ev2 = new CheckEvaluator(CHECKS);
    ev2.evaluate(ctx({ now: 0, yawDeg: 30 }), DEFAULT_SETTINGS.checks);
    ev2.evaluate(ctx({ now: 500, yawDeg: 30, speaking: false }), DEFAULT_SETTINGS.checks);
    ev2.evaluate(ctx({ now: 2100, yawDeg: 30, speaking: false }), DEFAULT_SETTINGS.checks);
    r = ev2.evaluate(ctx({ now: 2200, yawDeg: 30 }), DEFAULT_SETTINGS.checks);
    expect(r.facing.status).toBe('ok');
    r = ev2.evaluate(ctx({ now: 3300, yawDeg: 30 }), DEFAULT_SETTINGS.checks);
    expect(r.facing.status).toBe('issue');
  });
  it('losing tracking clears hold timers at once, even during a short pause', () => {
    const ev = new CheckEvaluator(CHECKS);
    ev.evaluate(ctx({ now: 0, yawDeg: 30 }), DEFAULT_SETTINGS.checks);
    ev.evaluate(ctx({ now: 500, yawDeg: 30, tracked: false }), DEFAULT_SETTINGS.checks);
    const r = ev.evaluate(ctx({ now: 1100, yawDeg: 30 }), DEFAULT_SETTINGS.checks);
    expect(r.facing.status).toBe('ok');
  });

  it('facing is measured from the rehearsal baseline', () => {
    const ev = new CheckEvaluator(CHECKS);
    const baseline = { version: 1 as const, createdAt: '', yawDeg: 12, syllableRate: 3, apertureLow: 0.04, apertureHigh: 0.2, mouthLumRatio: null, talkSeconds: 30 };
    ev.evaluate(ctx({ now: 0, yawDeg: 28, baseline }), DEFAULT_SETTINGS.checks);
    const r = ev.evaluate(ctx({ now: 2000, yawDeg: 28, baseline }), DEFAULT_SETTINGS.checks);
    expect(r.facing.status).toBe('ok'); // 16 degrees from baseline
  });

  it('FACE_NOT_FORWARD needs 1.5 s', () => {
    const ev = new CheckEvaluator(CHECKS);
    const code = (n: string) => n === 'FACE_NOT_FORWARD';
    ev.evaluate(ctx({ now: 0, yawDeg: null, code }), DEFAULT_SETTINGS.checks);
    expect(ev.evaluate(ctx({ now: 1400, yawDeg: null, code }), DEFAULT_SETTINGS.checks).facing.status).toBe('ok');
    expect(ev.evaluate(ctx({ now: 1500, yawDeg: null, code }), DEFAULT_SETTINGS.checks).facing.status).toBe('issue');
  });

  it('TOO_DARK gives "Your face is too dark"', () => {
    const ev = new CheckEvaluator(CHECKS);
    const code = (n: string) => n === 'TOO_DARK';
    ev.evaluate(ctx({ now: 0, code }), DEFAULT_SETTINGS.checks);
    const r = ev.evaluate(ctx({ now: 1600, code }), DEFAULT_SETTINGS.checks);
    expect(r.light).toEqual({ status: 'issue', message: 'Your face is too dark' });
  });

  it('disabled checks are never evaluated', () => {
    const ev = new CheckEvaluator(CHECKS);
    const checks = { ...DEFAULT_SETTINGS.checks, facing: false };
    ev.evaluate(ctx({ now: 0, yawDeg: 40 }), checks);
    expect(ev.evaluate(ctx({ now: 3000, yawDeg: 40 }), checks).facing.status).toBe('unknown');
  });
});
