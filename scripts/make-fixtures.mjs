// Generates the synthetic, numbers-only fixtures in fixtures/.
// They model a 1280x720 webcam at 30 Hz with known head yaw, distance, lip motion and lighting,
// so tests can check the rules against hand-counted expectations. They are NOT real recordings:
// every file has "synthetic": true and the replay screen says so.
//
//   node scripts/make-fixtures.mjs

import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const OUT = resolve(import.meta.dirname, '..', 'fixtures');
mkdirSync(OUT, { recursive: true });

const FW = 1280;
const FH = 720;
const HZ = 30;
const NOSE_DEPTH_RATIO = 0.45; // must match rules/thresholds.ts
const EYE_PX = 180; // outer-eye distance at normal distance, frontal

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const r1 = (v) => Math.round(v * 10) / 10;
const P = (x, y) => ({ x: r1(x), y: r1(y) });

/** Face geometry for a given yaw (deg), scale (1 = normal distance) and lip aperture (normalised by eye distance). */
function face(t, { yaw = 0, scale = 1, aperture = 0.03, cx = FW / 2, cy = FH / 2 - 20 }, noise) {
  const th = (yaw * Math.PI) / 180;
  const w = EYE_PX * scale * Math.cos(th);
  const j = () => (noise() - 0.5) * 1.2; // ±0.6 px landmark jitter
  const eyeY = cy - 40 * scale;
  const eyeOuterL = P(cx - w / 2 + j(), eyeY + j());
  const eyeOuterR = P(cx + w / 2 + j(), eyeY + j());
  const nose = P(cx + w * NOSE_DEPTH_RATIO * Math.tan(th) + j(), cy + 20 * scale + j());
  const mouthY = cy + 70 * scale;
  const mw = 0.58 * w;
  const mcx = cx + w * 0.25 * Math.tan(th);
  const gap = aperture * w;
  return {
    t: r1(t),
    frameW: FW,
    frameH: FH,
    stable: true,
    reset: false,
    nose,
    eyeOuterL,
    eyeOuterR,
    mouthL: P(mcx - mw / 2 + j(), mouthY + j()),
    mouthR: P(mcx + mw / 2 + j(), mouthY + j()),
    lipTop: P(mcx, mouthY - gap / 2),
    lipBottom: P(mcx, mouthY + gap / 2),
    box: { x: r1(cx - w * 0.85), y: r1(cy - 120 * scale), w: r1(w * 1.7), h: r1(250 * scale) },
  };
}

/**
 * Build a recording from a timeline function: (tSeconds) => state
 * state = { talking, yaw, scale, rate (syllables/s), face (bool), code, faceLum, ringLum, mouthLum }
 */
function build(name, durationS, stateAt, { seed = 1, baseline = DEFAULT_BASELINE, description = '', settings } = {}) {
  const noise = rng(seed);
  const events = [];
  let phase = 0;
  let lastCode = null;
  for (let i = 0; i <= durationS * HZ; i++) {
    const t = (i * 1000) / HZ;
    const s = { talking: false, yaw: 0, scale: 1, rate: 3.5, face: true, code: 'OK', faceLum: 140, ringLum: 120, ...stateAt(t / 1000) };
    // short natural gaps between phrases (shorter than the 400 ms hangover)
    const inPhraseGap = s.talking && (t % 3200) > 2950;
    const detected = s.talking && !inPhraseGap;
    phase += (2 * Math.PI * s.rate) / HZ;
    const aperture = detected ? 0.04 + 0.16 * (0.5 - 0.5 * Math.cos(phase)) + (noise() - 0.5) * 0.01 : 0.03 + (noise() - 0.5) * 0.004;
    const code = s.face ? s.code : 'NO_FACE_FOUND';
    if (code !== lastCode) {
      events.push({ kind: 'validation', t: r1(t), code, hint: HINTS[code] ?? '' });
      lastCode = code;
    }
    if (s.face) {
      events.push({ kind: 'face', sample: face(t, { yaw: s.yaw, scale: s.scale, aperture }, noise) });
      events.push({ kind: 'talking', t: r1(t), detected, stable: true });
    }
    if (i % (HZ / 2) === 0 && s.face) {
      const mouthLum = s.mouthLum ?? s.faceLum * 0.85;
      events.push({ kind: 'brightness', t: r1(t), faceLum: r1(s.faceLum), ringLum: r1(s.ringLum), mouthLum: r1(mouthLum) });
    }
  }
  const rec = {
    format: 'legible-recording',
    version: 1,
    name,
    synthetic: true,
    description,
    createdAt: '2026-11-20T00:00:00.000Z',
    durationMs: durationS * 1000,
    baseline,
    ...(settings ? { settings } : {}),
    events,
  };
  writeFileSync(resolve(OUT, `${name}.json`), JSON.stringify(rec));
  console.log(`${name}.json  ${events.length} events, ${durationS}s`);
}

const HINTS = {
  NO_FACE_FOUND: 'No face detected. Make sure your face is visible to the camera.',
  MULTIPLE_FACES_FOUND: 'More than one face detected.',
  FACE_NOT_FORWARD: 'Please face the camera.',
  TOO_DARK: 'Lighting is too dark.',
  FACE_TOO_FAR: 'Move closer to the camera.',
};

const DEFAULT_BASELINE = {
  version: 1,
  createdAt: '2026-11-20T00:00:00.000Z',
  yawDeg: 0,
  syllableRate: 3.3, // what the counter measures for 3.5 Hz lip motion with phrase gaps
  apertureLow: 0.045,
  apertureHigh: 0.195,
  mouthLumRatio: 0.85,
  talkSeconds: 40,
};

const between = (t, a, b) => t >= a && t < b;

// 1. Turning away while talking: yaw 30° from 10 s to 14 s.
build('turning-away', 40, (t) => ({ talking: true, yaw: between(t, 10, 14) ? 30 : 0 }), {
  seed: 1,
  description: 'Talking for 40 s; head turned 30° to a second screen from 10 s to 14 s.',
});

// 2. Turning away while silent: talks 0–5 s and 25–30 s; turned 35° from 8 to 20 s while listening.
build('silent-turning', 30, (t) => ({ talking: t < 5 || t >= 25, yaw: between(t, 8, 20) ? 35 : 0 }), {
  seed: 2,
  description: 'Listening from 5 s to 25 s with the head turned 35° from 8 s to 20 s. No nudge expected.',
});

// 3. Backlit: window behind from 10 s to 25 s.
build(
  'backlit',
  40,
  (t) => (between(t, 10, 25) ? { talking: true, faceLum: 70, ringLum: 205 } : { talking: true }),
  { seed: 3, description: 'Talking for 40 s; bright window behind the head from 10 s to 25 s (face/background 0.34).' },
);

// 4. Rushing: normal pace (3.5/s) then fast (5.5/s) from 25 s.
build('rushing', 60, (t) => ({ talking: true, rate: t >= 25 ? 5.5 : 3.5 }), {
  seed: 4,
  // Pace is off by default since real-face tests (it is experimental); this fixture exercises the check itself
  settings: { checks: { pace: true } },
  description: 'Talking for 60 s at 3.5 visible syllables/s, then 5.5/s from 25 s.',
});

// 5. Covered lens: no face from 10 s to 15 s while talking.
build('covered-lens', 30, (t) => ({ talking: true, face: !between(t, 10, 15), yaw: between(t, 10, 15) ? 40 : 0 }), {
  seed: 5,
  description: 'Lens covered from 10 s to 15 s. Not tracking; no nudge; excluded from tracked talk time.',
});

// 6. Second face: MULTIPLE_FACES_FOUND from 10 s to 16 s while the user is turned away.
build(
  'second-face',
  30,
  (t) => ({ talking: true, code: between(t, 10, 16) ? 'MULTIPLE_FACES_FOUND' : 'OK', yaw: between(t, 10, 16) ? 30 : 0 }),
  { seed: 6, description: 'A second person leans in from 10 s to 16 s. Judgement pauses; no nudge.' },
);

// 7. Rehearsal: eight sentences at a normal pace, facing the camera.
build(
  'rehearsal',
  48,
  (t) => ({ talking: t % 6 < 4.6, yaw: 2 }),
  { seed: 7, baseline: null, description: 'Eight sentences read facing the camera, used to test the baseline.' },
);

// 8. Demo for judges: the whole story in 100 s.
build(
  'demo',
  100,
  (t) => {
    if (t < 6) return { talking: false }; // listening
    if (t < 16) return { talking: true }; // readable
    if (t < 21) return { talking: true, yaw: 32 }; // turned to second screen while talking -> Face
    if (t < 26) return { talking: true }; // back
    if (t < 34) return { talking: false, yaw: 40 }; // turned away while listening -> nothing
    if (t < 38) return { talking: true };
    if (t < 50) return { talking: true, faceLum: 72, ringLum: 210 }; // window behind -> Light
    if (t < 56) return { talking: true };
    if (t < 64) return { talking: true, scale: 0.35 }; // leaned back (mouth ~2.9% of frame width) -> Distance
    if (t < 68) return { talking: false };
    if (t < 86) return { talking: true, rate: t > 70 ? 5.6 : 3.5 }; // rushing -> Pace
    if (t < 92) return { talking: true, code: 'MULTIPLE_FACES_FOUND' }; // second face -> Not tracking
    return { talking: true };
  },
  {
    seed: 8,
    settings: { checks: { pace: true } }, // shows the experimental Pace check too
    description:
      'Synthetic demo: listening, readable, turning to a second screen while talking, turning away while silent, a window behind, leaning back, rushing, a second face.',
  },
);
