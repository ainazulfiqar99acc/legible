// Scenario tests on the synthetic fixtures (see scripts/make-fixtures.mjs for each script).

import { describe, expect, it } from 'vitest';
import { replay } from './helpers';
import { CHECK_PRIORITY } from '../../shared/types';

describe('turning away while talking', () => {
  const r = replay('turning-away');
  it('fires exactly one Facing nudge within 1.5 s of the turn', () => {
    expect(r.nudges.map((n) => n.check)).toEqual(['facing']);
    const n = r.nudges[0]!;
    expect(n.t).toBeGreaterThanOrEqual(10_000 + 1000); // held 1 s
    expect(n.t).toBeLessThanOrEqual(10_000 + 1500);
    expect(n.message).toBe('Face the camera while you talk');
  });
  it('clears about 2 s after turning back', () => {
    const c = r.clears.find((x) => x.check === 'facing')!;
    expect(c.t).toBeGreaterThanOrEqual(14_000 + 2000);
    expect(c.t).toBeLessThanOrEqual(14_000 + 2500);
  });
  it('shows the Face light red and the message on the strip while active', () => {
    const f = r.frames.find((x) => x.now >= 12_000)!;
    expect(f.out.lights.facing).toBe('issue');
    expect(f.out.line).toBe('Face the camera while you talk');
    const g = r.frames.find((x) => x.now >= 5_000)!;
    expect(g.out.lights.facing).toBe('good');
    expect(g.out.line).toBe('Readable');
  });
});

describe('turning away while silent', () => {
  const r = replay('silent-turning');
  it('never nudges while the user listens', () => {
    expect(r.nudges).toEqual([]);
  });
  it('shows neutral "Listening" lights while silent', () => {
    const f = r.frames.find((x) => x.now >= 12_000)!;
    expect(f.out.speaking).toBe(false);
    expect(f.out.line).toBe('Listening');
    expect(Object.values(f.out.lights).filter((l) => l !== 'disabled').every((l) => l === 'listening')).toBe(true);
  });
});

describe('backlit', () => {
  const r = replay('backlit');
  it('fires a Light nudge "Light is behind you" within 3.5 s', () => {
    expect(r.nudges.map((n) => n.check)).toEqual(['light']);
    expect(r.nudges[0]!.message).toBe('Light is behind you');
    expect(r.nudges[0]!.t).toBeGreaterThanOrEqual(10_000 + 3000);
    expect(r.nudges[0]!.t).toBeLessThanOrEqual(10_000 + 3600); // 2 fps probe adds up to 0.5 s
  });
});

describe('rushing', () => {
  const r = replay('rushing');
  it('does not flag normal pace', () => {
    expect(r.nudges.filter((n) => n.t < 25_000)).toEqual([]);
  });
  it('fires "Slow down a little" once the 10 s window is mostly fast', () => {
    const pace = r.nudges.filter((n) => n.check === 'pace');
    expect(pace.length).toBeGreaterThanOrEqual(1);
    expect(pace[0]!.message).toBe('Slow down a little');
    expect(pace[0]!.t).toBeGreaterThan(25_000);
    expect(pace[0]!.t).toBeLessThan(35_000);
  });
});

describe('covered lens', () => {
  const r = replay('covered-lens');
  it('goes to Not tracking within 1 s and never judges', () => {
    expect(r.nudges).toEqual([]);
    const lost = r.analyzer.log.find((e) => e.type === 'tracking' && !e.tracked && e.t > 9000)!;
    expect(lost.t - 10_000).toBeLessThanOrEqual(1000);
    const f = r.frames.find((x) => x.now >= 12_000)!;
    expect(f.out.tracking).toBe(false);
    expect(Object.values(f.out.lights).filter((l) => l !== 'disabled').every((l) => l === 'untracked')).toBe(true);
    expect(f.out.line).toBe('Not tracking — face not found');
  });
  it('excludes untracked time from tracked talk time', () => {
    expect(r.totals.trackedTalkMs).toBeLessThan(r.totals.elapsedMs - 4500);
  });
});

describe('second face', () => {
  const r = replay('second-face');
  it('pauses judgement and says why', () => {
    expect(r.nudges).toEqual([]);
    const f = r.frames.find((x) => x.now >= 12_000)!;
    expect(f.out.tracking).toBe(false);
    expect(f.out.line).toBe('Not tracking — more than one face');
  });
});

describe('demo', () => {
  const r = replay('demo');
  it('tells the whole story: Face, Light, Distance, Pace in order, nothing while listening', () => {
    expect(r.nudges.map((n) => n.check)).toEqual(['facing', 'light', 'distance', 'pace']);
    // nothing between 26 s and 34 s (turned away while listening)
    expect(r.nudges.some((n) => n.t > 26_000 && n.t < 36_000)).toBe(false);
  });
});

describe('receipt maths', () => {
  for (const name of ['turning-away', 'backlit', 'rushing', 'covered-lens', 'second-face', 'demo', 'silent-turning']) {
    it(`${name}: totals equal a hand count over the tick frames`, () => {
      const r = replay(name);
      // hand count: walk the frames and sum intervals using the previous frame's state
      let talk = 0;
      let tracked = 0;
      let readable = 0;
      for (let i = 1; i < r.frames.length; i++) {
        const p = r.frames[i - 1]!;
        const dt = r.frames[i]!.now - p.now;
        const rawTalking = p.out.speaking || (!p.out.tracking && false);
        if (p.out.speaking) {
          talk += dt;
          tracked += dt;
          if (!CHECK_PRIORITY.some((id) => p.out.checks[id] === 'issue')) readable += dt;
        } else if (rawTalking) talk += dt;
      }
      expect(r.totals.trackedTalkMs).toBe(tracked);
      expect(r.totals.readableMs).toBe(readable);
      expect(r.totals.talkMs).toBeGreaterThanOrEqual(talk);
      const receipt = r.analyzer.receipt.build('replay', new Date(0), new Date(r.endMs));
      if (tracked > 0) expect(receipt.readablePct).toBe(Math.round((readable / tracked) * 100));
    });
  }

  it('turning-away: readable time is talk time minus ~3 s of facing issue', () => {
    const r = replay('turning-away');
    const issueS = r.totals.issueMs.facing / 1000;
    expect(issueS).toBeGreaterThan(2.6);
    expect(issueS).toBeLessThan(3.4);
    expect(r.totals.readableMs + r.totals.issueMs.facing).toBe(r.totals.trackedTalkMs);
    const receipt = r.analyzer.receipt.build('replay', new Date(0), new Date(r.endMs));
    expect(receipt.topIssue).toBe('facing');
    expect(receipt.nudgeCount).toBe(1);
  });
});

describe('replay determinism', () => {
  it('produces the same nudges on every run', () => {
    const a = replay('demo').nudges;
    const b = replay('demo').nudges;
    expect(b).toEqual(a);
  });
});

describe('long run without a breath pause (Pauses, from the breathing trace)', () => {
  const r = replay('long-run');
  it('nudges "Pause between sentences" once the talk run passes 25 s', () => {
    const p = r.nudges.filter((n) => n.check === 'phrase');
    expect(p.length).toBe(1);
    expect(p[0]!.message).toBe('Pause between sentences');
    expect(p[0]!.t).toBeGreaterThanOrEqual(25_000);
    expect(p[0]!.t).toBeLessThan(27_000);
  });
  it('stays quiet once the speaker breathes between phrases', () => {
    expect(r.nudges.filter((n) => n.t > 36_000)).toEqual([]);
    const f = r.frames.find((x) => x.now >= 45_000 && x.out.speaking)!;
    expect(f.out.lights.phrase).toBe('good');
  });
});

describe('demo with a breathing trace', () => {
  const r = replay('demo');
  it('shows the Pauses light green while talking with normal breath pauses', () => {
    const f = r.frames.find((x) => x.now >= 9_000 && x.out.speaking)!;
    expect(f.out.lights.phrase).toBe('good');
  });
  it('never nudges Pauses, because the speaker breathes within 25 s', () => {
    expect(r.nudges.some((n) => n.check === 'phrase')).toBe(false);
  });
});

describe('Pauses without breathing data', () => {
  it('shows "No data", never an issue, when the SDK sends no chest trace', () => {
    const r = replay('turning-away');
    const f = r.frames.find((x) => x.now >= 5_000 && x.out.speaking)!;
    expect(f.out.lights.phrase).toBe('unknown');
    expect(r.nudges.some((n) => n.check === 'phrase')).toBe(false);
  });
});
