import { describe, expect, it } from 'vitest';
import { lipAperture, mouthWidthFraction, yawDegrees } from '../../windows/sensor/features/geometry';
import { SyllableCounter } from '../../windows/sensor/features/syllables';
import { measureBrightness, rgbaToLuma } from '../../windows/sensor/features/brightness';
import { SpeakingGate, ValidationTracker, trackingVerdict } from '../../windows/sensor/gate';
import { metricsToEvents, toFaceSample, validationName } from '../../windows/sensor/decode';
import { Analyzer } from '../../windows/sensor/analyzer';
import { DEFAULT_SETTINGS } from '../../shared/types';
import type { FaceSample } from '../../shared/types';
import { NOSE_DEPTH_RATIO } from '../../rules/thresholds';
import { loadFixture } from './helpers';
import { evT } from '../../windows/sensor/decode';

function sampleAtYaw(deg: number, roll = 0): FaceSample {
  const th = (deg * Math.PI) / 180;
  const w = 180 * Math.cos(th);
  const cx = 640;
  const cy = 340;
  const rot = (x: number, y: number) => {
    const r = (roll * Math.PI) / 180;
    return { x: cx + (x - cx) * Math.cos(r) - (y - cy) * Math.sin(r), y: cy + (x - cx) * Math.sin(r) + (y - cy) * Math.cos(r) };
  };
  return {
    t: 0,
    frameW: 1280,
    frameH: 720,
    stable: true,
    reset: false,
    eyeOuterL: rot(cx - w / 2, cy - 40),
    eyeOuterR: rot(cx + w / 2, cy - 40),
    nose: rot(cx + w * NOSE_DEPTH_RATIO * Math.tan(th), cy + 20),
    mouthL: rot(cx - 52, cy + 70),
    mouthR: rot(cx + 52, cy + 70),
    lipTop: rot(cx, cy + 62),
    lipBottom: rot(cx, cy + 78),
    box: { x: 480, y: 200, w: 320, h: 260 },
  };
}

describe('geometry', () => {
  it('recovers yaw at 0, 15 and 30 degrees', () => {
    for (const d of [0, 15, 30, -30]) expect(yawDegrees(sampleAtYaw(d))!).toBeCloseTo(d, 5);
  });
  it('head roll does not read as yaw', () => {
    expect(Math.abs(yawDegrees(sampleAtYaw(0, 20))!)).toBeLessThan(0.5);
  });
  it('mouth width is a fraction of frame width', () => {
    expect(mouthWidthFraction(sampleAtYaw(0))).toBeCloseTo(104 / 1280, 5);
  });
  it('aperture is normalised by eye distance', () => {
    expect(lipAperture(sampleAtYaw(0))).toBeCloseTo(16 / 180, 5);
  });
});

describe('syllable counter', () => {
  function rateFor(hz: number, seconds = 12) {
    const c = new SyllableCounter(0.04, 0.2);
    let phase = 0;
    for (let i = 0; i < seconds * 30; i++) {
      phase += (2 * Math.PI * hz) / 30;
      c.pushAperture((i * 1000) / 30, 0.04 + 0.16 * (0.5 - 0.5 * Math.cos(phase)));
      c.advance(1000 / 30, true);
    }
    return c.windowRate();
  }
  it('counts one peak per syllable', () => {
    expect(rateFor(3)!).toBeCloseTo(3, 0);
    expect(rateFor(5)!).toBeCloseTo(5, 0);
  });
  it('slow / normal / fast separate by at least 20%', () => {
    const slow = rateFor(2.5)!;
    const normal = rateFor(3.5)!;
    const fast = rateFor(5)!;
    expect(normal / slow).toBeGreaterThan(1.2);
    expect(fast / normal).toBeGreaterThan(1.2);
  });
  it('ignores tiny wobble below the prominence', () => {
    const c = new SyllableCounter(0.04, 0.2);
    for (let i = 0; i < 400; i++) {
      c.pushAperture(i * 33, 0.1 + 0.01 * Math.sin(i));
      c.advance(33, true);
    }
    expect(c.windowRate()).toBe(0);
  });
  it('needs a full window of talking before it reports', () => {
    expect(rateFor(3, 5)).toBeNull();
  });
});

describe('brightness', () => {
  it('detects a backlit face', () => {
    const w = 160;
    const h = 90;
    const luma = new Uint8Array(w * h).fill(220);
    for (let y = 25; y < 75; y++) for (let x = 60; x < 100; x++) luma[y * w + x] = 60;
    const r = measureBrightness(luma, w, h, { x: 60, y: 25, w: 40, h: 50 }, null)!;
    expect(r.faceLum).toBe(60);
    expect(r.ringLum).toBe(220);
  });
  it('converts RGBA to luma', () => {
    const out = rgbaToLuma(new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255]), new Uint8Array(2));
    expect([...out]).toEqual([255, 0]);
  });
});

describe('gate', () => {
  it('holds speaking through gaps shorter than 700 ms', () => {
    const g = new SpeakingGate();
    g.push(0, true);
    g.push(100, false);
    g.push(500, false);
    expect(g.speaking(650)).toBe(true);
    expect(g.speaking(750)).toBe(false);
  });
  it('validation codes are debounced', () => {
    const v = new ValidationTracker();
    v.push(0, 'TOO_DARK', 'Too dark');
    expect(v.holds('TOO_DARK', 200)).toBe(false);
    expect(v.holds('TOO_DARK', 600)).toBe(true);
    v.push(650, 'OK', '');
    expect(v.holds('TOO_DARK', 700)).toBe(false);
  });
  it('a second face stops tracking within 250 ms; a single-frame report does not', () => {
    const v = new ValidationTracker();
    v.push(1000, 'MULTIPLE_FACES_FOUND', '');
    expect(trackingVerdict(1050, 1050, v).tracked).toBe(true);
    expect(trackingVerdict(1250, 1250, v).tracked).toBe(false);
    v.push(1300, 'OK', '');
    v.push(2000, 'MULTIPLE_FACES_FOUND', '');
    v.push(2040, 'OK', ''); // a 40 ms glitch, as seen on a real camera
    expect(trackingVerdict(2300, 2300, v).tracked).toBe(true);
  });
  it('stale landmarks stop tracking within 1 s', () => {
    const v = new ValidationTracker();
    expect(trackingVerdict(500, 0, v).tracked).toBe(true);
    expect(trackingVerdict(1000, 0, v).tracked).toBe(false);
  });
});

describe('decode', () => {
  it('maps validation integers from the SDK typings', () => {
    expect(validationName(0)).toBe('OK');
    expect(validationName(2)).toBe('MULTIPLE_FACES_FOUND');
    expect(validationName(17)).toBe('FACE_NOT_FORWARD');
    expect(validationName(99)).toBe('UNKNOWN');
  });
  it('keeps only the needed points from 478 landmarks', () => {
    const value = Array.from({ length: 478 }, (_, i) => ({ x: i, y: i * 2 }));
    const s = toFaceSample({ value, stable: true, reset: false, timestamp: 5 }, 10, 1280, 720)!;
    expect(s.nose).toEqual({ x: 1, y: 2 });
    expect(s.mouthR).toEqual({ x: 291, y: 582 });
    expect(s.box).toEqual({ x: 0, y: 0, w: 477, h: 954 });
  });
  it('rejects landmark sets that are not the 478-point model', () => {
    expect(toFaceSample({ value: [{ x: 1, y: 1 }] }, 0, 1, 1)).toBeNull();
  });
  it('turns a Metrics packet into sorted events', () => {
    const value = Array.from({ length: 478 }, () => ({ x: 1, y: 1 }));
    const ev = metricsToEvents(
      { face: { landmarks: [{ value, timestamp: 2000 }], talking: [{ detected: true, stable: true, timestamp: 1000 }] } },
      (us) => (us ?? 0) / 1000,
      1280,
      720,
    );
    expect(ev.map((e) => e.kind)).toEqual(['talking', 'face']);
  });
});

describe('rehearsal baseline', () => {
  function baselineFrom(seedShift: number) {
    const rec = loadFixture('rehearsal');
    const a = new Analyzer({ mode: 'rehearsal', settings: DEFAULT_SETTINGS, baseline: null, setBaseline: true });
    const events = [...rec.events].sort((x, y) => evT(x) - evT(y));
    let i = 0;
    for (let t = seedShift; t <= rec.durationMs; t += 33) {
      while (i < events.length && evT(events[i]!) <= t) a.push(events[i++]!);
      a.tick(t);
    }
    return a.buildBaseline()!;
  }
  it('sets head and syllable-rate baselines from a rehearsal', () => {
    const b = baselineFrom(0);
    expect(b.yawDeg).toBeCloseTo(2, 0);
    // 3.5 Hz lip motion; talk time also includes phrase gaps and the 400 ms hangover,
    // so the measured rate per talking second is lower. Live sessions measure the same way.
    expect(b.syllableRate!).toBeGreaterThan(3.5 * 0.75);
    expect(b.syllableRate!).toBeLessThan(3.5 * 1.05);
  });
  it('is repeatable within ±15% across two runs', () => {
    const a = baselineFrom(0).syllableRate!;
    const b = baselineFrom(17).syllableRate!;
    expect(Math.abs(a - b) / a).toBeLessThan(0.15);
  });
});
