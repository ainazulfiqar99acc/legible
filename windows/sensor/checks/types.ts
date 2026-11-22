import type { Baseline, CheckId, Sensitivity, ValidationName } from '../../../shared/types';

/** Everything a check may look at, computed once per tick by the analyser. */
export interface CheckContext {
  now: number;
  speaking: boolean;
  tracked: boolean;
  sensitivity: Sensitivity;
  baseline: Baseline | null;
  /** smoothed head yaw in degrees, null when the last frame was unusable */
  yawDeg: number | null;
  /** mouth width / frame width */
  mouthWidth: number | null;
  /** face luminance / background ring luminance; null if unknown or stale */
  backlightRatio: number | null;
  faceLum: number | null;
  /** mouth-region luminance / face luminance */
  mouthLumRatio: number | null;
  /** visible syllables per second of talking, last window; null when not enough data */
  paceRate: number | null;
  /** median aperture peak height in the window */
  peakHeight: number | null;
  /** how long the current talk run has gone without a breath pause */
  talkRunMs: number | null;
  /** whether the landmark set was just reset around the mouth */
  landmarkReset: boolean;
  /** debounced SDK validation code check */
  code: (name: ValidationName) => boolean;
}

/**
 * One rule inside a check. `active` null = cannot tell (unknown, never an issue).
 * The evaluator turns a condition into an issue once it has been active for `holdMs` while speaking.
 */
export interface Condition {
  key: string;
  active: boolean | null;
  holdMs: number;
  message: string;
}

export type CheckFn = (ctx: CheckContext) => Condition[];
export type CheckTable = Record<CheckId, CheckFn>;
