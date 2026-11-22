// Converts decoded SmartSpectra Metrics into Legible SensorEvents.
// Kept free of SDK imports (it receives the already-decoded plain object) so it can be unit-tested.
//
// Verified against @smartspectra/node-sdk 3.5.0 js/messages/generated.d.ts:
//   Metrics.face.talking: DetectionStatus[]  {detected, stable, timestamp(us)}
//   Metrics.face.landmarks: Landmarks[]      {value: Point2dFloat[], stable, reset, timestamp(us)}
//   Metrics.breathing.upperTrace: Measurement[] {value, stable, timestamp(us)}

import type { FaceSample, Point, SensorEvent, ValidationName } from '../../shared/types';
import { LANDMARK, LANDMARK_COUNT } from '../../rules/thresholds';

/** Integer → name, from ValidationCode in @smartspectra/node-sdk 3.5.0 index.d.ts. */
const VALIDATION_NAMES: Record<number, ValidationName> = {
  0: 'OK',
  1: 'NO_FACE_FOUND',
  2: 'MULTIPLE_FACES_FOUND',
  3: 'FACE_NOT_CENTERED',
  4: 'FACE_SIZE_OUT_OF_RANGE',
  5: 'TOO_DARK',
  6: 'TOO_BRIGHT',
  7: 'CHEST_NOT_VISIBLE',
  10: 'CAMERA_TUNING',
  11: 'FRAME_RATE_TOO_LOW',
  12: 'EXCESSIVE_MOTION',
  13: 'FACE_TOO_CLOSE',
  14: 'FACE_TOO_FAR',
  15: 'FACE_TOO_HIGH',
  16: 'FACE_TOO_LOW',
  17: 'FACE_NOT_FORWARD',
};

export function validationName(code: number): ValidationName {
  return VALIDATION_NAMES[code] ?? 'UNKNOWN';
}

type Long = { toNumber(): number };
type Ts = number | Long | null | undefined;
const tsUs = (t: Ts): number | null => (t === null || t === undefined ? null : typeof t === 'number' ? t : t.toNumber());

interface PlainPoint {
  x?: number | null;
  y?: number | null;
}
interface PlainLandmarks {
  value?: PlainPoint[] | null;
  stable?: boolean | null;
  reset?: boolean | null;
  timestamp?: Ts;
}
interface PlainDetection {
  detected?: boolean | null;
  stable?: boolean | null;
  timestamp?: Ts;
}
interface PlainMeasurement {
  value?: number | null;
  stable?: boolean | null;
  timestamp?: Ts;
}
export interface PlainMetrics {
  face?: { talking?: PlainDetection[] | null; landmarks?: PlainLandmarks[] | null } | null;
  breathing?: { upperTrace?: PlainMeasurement[] | null } | null;
}

const pt = (p: PlainPoint | undefined): Point => ({ x: p?.x ?? 0, y: p?.y ?? 0 });

/** Map one landmark set to the compact FaceSample. Returns null if the set is not the 478-point model. */
export function toFaceSample(lm: PlainLandmarks, t: number, frameW: number, frameH: number): FaceSample | null {
  const v = lm.value;
  if (!v || v.length < LANDMARK_COUNT) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of v) {
    const x = p.x ?? 0;
    const y = p.y ?? 0;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return {
    t,
    frameW,
    frameH,
    stable: !!lm.stable,
    reset: !!lm.reset,
    nose: pt(v[LANDMARK.noseTip]),
    eyeOuterL: pt(v[LANDMARK.eyeOuterL]),
    eyeOuterR: pt(v[LANDMARK.eyeOuterR]),
    mouthL: pt(v[LANDMARK.mouthL]),
    mouthR: pt(v[LANDMARK.mouthR]),
    lipTop: pt(v[LANDMARK.lipTop]),
    lipBottom: pt(v[LANDMARK.lipBottom]),
    box: { x: minX, y: minY, w: maxX - minX, h: maxY - minY },
  };
}

/**
 * Convert one decoded Metrics packet into events.
 * `toSessionMs` maps an SDK microsecond timestamp to ms since the session started.
 */
export function metricsToEvents(
  m: PlainMetrics,
  toSessionMs: (us: number | null) => number,
  frameW: number,
  frameH: number,
): SensorEvent[] {
  const out: SensorEvent[] = [];
  for (const lm of m.face?.landmarks ?? []) {
    const s = toFaceSample(lm, toSessionMs(tsUs(lm.timestamp)), frameW, frameH);
    if (s) out.push({ kind: 'face', sample: s });
  }
  for (const d of m.face?.talking ?? []) {
    out.push({ kind: 'talking', t: toSessionMs(tsUs(d.timestamp)), detected: !!d.detected, stable: !!d.stable });
  }
  for (const b of m.breathing?.upperTrace ?? []) {
    if (typeof b.value === 'number') {
      out.push({ kind: 'breath', t: toSessionMs(tsUs(b.timestamp)), value: b.value, stable: !!b.stable });
    }
  }
  out.sort((a, b) => evT(a) - evT(b));
  return out;
}

export const evT = (e: SensorEvent): number => (e.kind === 'face' ? e.sample.t : e.t);

/** Face box and mouth box scaled into probe-frame coordinates. */
export function probeBoxes(s: FaceSample, probeW: number, probeH: number) {
  const sx = probeW / s.frameW;
  const sy = probeH / s.frameH;
  const face = { x: s.box.x * sx, y: s.box.y * sy, w: s.box.w * sx, h: s.box.h * sy };
  const mw = Math.abs(s.mouthR.x - s.mouthL.x);
  const cx = (s.mouthL.x + s.mouthR.x) / 2;
  const cy = (s.lipTop.y + s.lipBottom.y) / 2;
  const mouth = { x: (cx - mw * 0.6) * sx, y: (cy - mw * 0.35) * sy, w: mw * 1.2 * sx, h: mw * 0.7 * sy };
  return { face, mouth };
}
