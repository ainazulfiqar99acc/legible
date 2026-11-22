// Geometry features from one FaceSample. Pure functions.

import type { FaceSample, Point } from '../../../shared/types';
import { NOSE_DEPTH_RATIO } from '../../../rules/thresholds';

export const dist = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);

/** Distance between the outer eye corners in pixels. */
export function eyeDistance(s: FaceSample): number {
  return dist(s.eyeOuterL, s.eyeOuterR);
}

/**
 * Head yaw in degrees (sign: positive = nose towards image right).
 * Nose-tip offset from the eye-corner midpoint, projected on the eye line, divided by eye distance
 * gives (depth/width)·tan(yaw). Returns null for degenerate geometry.
 */
export function yawDegrees(s: FaceSample): number | null {
  const ex = s.eyeOuterR.x - s.eyeOuterL.x;
  const ey = s.eyeOuterR.y - s.eyeOuterL.y;
  const w = Math.hypot(ex, ey);
  if (!(w > 4)) return null;
  const ux = ex / w;
  const uy = ey / w;
  const mx = (s.eyeOuterL.x + s.eyeOuterR.x) / 2;
  const my = (s.eyeOuterL.y + s.eyeOuterR.y) / 2;
  // component of (nose - mid) along the eye line, so head roll does not read as yaw
  const along = (s.nose.x - mx) * ux + (s.nose.y - my) * uy;
  const ratio = along / w;
  return (Math.atan(ratio / NOSE_DEPTH_RATIO) * 180) / Math.PI;
}

/** Mouth width (corner to corner) as a fraction of frame width. */
export function mouthWidthFraction(s: FaceSample): number | null {
  if (!(s.frameW > 0)) return null;
  return dist(s.mouthL, s.mouthR) / s.frameW;
}

/** Inner-lip opening normalised by eye distance (scale-free). */
export function lipAperture(s: FaceSample): number | null {
  const e = eyeDistance(s);
  if (!(e > 4)) return null;
  return dist(s.lipTop, s.lipBottom) / e;
}

/** Running median over the last n values. */
export class MovingMedian {
  private buf: number[] = [];
  constructor(private readonly n: number) {}
  push(v: number): number {
    this.buf.push(v);
    if (this.buf.length > this.n) this.buf.shift();
    return this.value()!;
  }
  value(): number | null {
    if (this.buf.length === 0) return null;
    const s = [...this.buf].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)]!;
  }
  clear(): void {
    this.buf = [];
  }
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

export function quantile(values: number[], q: number): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo]! + (s[hi]! - s[lo]!) * (pos - lo);
}
