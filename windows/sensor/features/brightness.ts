// Face vs background brightness from a tiny greyscale frame. Pure; the pixels are discarded by the caller.

import { RING_MARGIN } from '../../../rules/thresholds';

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface BrightnessReading {
  faceLum: number;
  ringLum: number;
  mouthLum: number | null;
}

/** ITU-R BT.601 luma from RGBA bytes into a reusable Uint8Array. */
export function rgbaToLuma(rgba: Uint8ClampedArray, out: Uint8Array): Uint8Array {
  for (let i = 0, j = 0; j < out.length; i += 4, j++) {
    out[j] = (rgba[i]! * 299 + rgba[i + 1]! * 587 + rgba[i + 2]! * 114) / 1000;
  }
  return out;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * Mean luma inside the face box (shrunk to its central 70% to skip hair and background at the edges),
 * mean luma of the ring around it (the box grown by RING_MARGIN on each side, minus the face box),
 * and optionally the mouth box.
 * `face` and `mouth` are in the probe frame's pixel coordinates.
 */
export function measureBrightness(
  luma: Uint8Array,
  w: number,
  h: number,
  face: Box,
  mouth: Box | null,
): BrightnessReading | null {
  if (face.w < 4 || face.h < 4) return null;
  const inner = {
    x0: clamp(Math.round(face.x + face.w * 0.15), 0, w),
    x1: clamp(Math.round(face.x + face.w * 0.85), 0, w),
    y0: clamp(Math.round(face.y + face.h * 0.15), 0, h),
    y1: clamp(Math.round(face.y + face.h * 0.85), 0, h),
  };
  const fx0 = clamp(Math.round(face.x), 0, w);
  const fx1 = clamp(Math.round(face.x + face.w), 0, w);
  const fy0 = clamp(Math.round(face.y), 0, h);
  const fy1 = clamp(Math.round(face.y + face.h), 0, h);
  const ring = {
    x0: clamp(Math.round(face.x - face.w * RING_MARGIN), 0, w),
    x1: clamp(Math.round(face.x + face.w * (1 + RING_MARGIN)), 0, w),
    y0: clamp(Math.round(face.y - face.h * RING_MARGIN), 0, h),
    // the ring stops at the bottom of the face: below is usually shirt, not background
    y1: fy1,
  };
  let fSum = 0;
  let fN = 0;
  let rSum = 0;
  let rN = 0;
  for (let y = ring.y0; y < ring.y1; y++) {
    for (let x = ring.x0; x < ring.x1; x++) {
      const v = luma[y * w + x]!;
      const inFace = x >= fx0 && x < fx1 && y >= fy0 && y < fy1;
      if (!inFace) {
        rSum += v;
        rN++;
      } else if (x >= inner.x0 && x < inner.x1 && y >= inner.y0 && y < inner.y1) {
        fSum += v;
        fN++;
      }
    }
  }
  if (fN === 0) return null;
  let mouthLum: number | null = null;
  if (mouth) {
    const mx0 = clamp(Math.round(mouth.x), 0, w);
    const mx1 = clamp(Math.round(mouth.x + mouth.w), 0, w);
    const my0 = clamp(Math.round(mouth.y), 0, h);
    const my1 = clamp(Math.round(mouth.y + mouth.h), 0, h);
    let s = 0;
    let n = 0;
    for (let y = my0; y < my1; y++) for (let x = mx0; x < mx1; x++) {
      s += luma[y * w + x]!;
      n++;
    }
    mouthLum = n ? s / n : null;
  }
  return { faceLum: fSum / fN, ringLum: rN >= 20 ? rSum / rN : Number.NaN, mouthLum };
}
