// The six checks. Each is a pure function from the tick context to conditions.
// Durations ("for >= 1 s while speaking") are applied by the evaluator, not here.

import { NUDGE } from '../../../shared/strings';
import {
  BACKLIGHT_HOLD_MS,
  BACKLIGHT_RATIO,
  DISTANCE_CODE_HOLD_MS,
  DISTANCE_HOLD_MS,
  EXAGGERATION_RATIO,
  FACE_DARK_LUM,
  FACING_CODE_HOLD_MS,
  FACING_YAW_DEG,
  FACING_YAW_HOLD_MS,
  LIGHT_CODE_HOLD_MS,
  MOUTH_WIDTH_MIN,
  OCCLUSION_HOLD_MS,
  OCCLUSION_LUM_DELTA,
  PACE_RATIO,
  PHRASE_MAX_RUN_MS,
} from '../../../rules/thresholds';
import type { CheckContext, CheckTable, Condition } from './types';

export const facing = (c: CheckContext): Condition[] => {
  const base = c.baseline?.yawDeg ?? 0;
  return [
    {
      key: 'yaw',
      active: c.yawDeg === null ? null : Math.abs(c.yawDeg - base) > FACING_YAW_DEG[c.sensitivity],
      holdMs: FACING_YAW_HOLD_MS,
      message: NUDGE.facing,
    },
    { key: 'code', active: c.code('FACE_NOT_FORWARD'), holdMs: FACING_CODE_HOLD_MS, message: NUDGE.facing },
  ];
};

export const light = (c: CheckContext): Condition[] => [
  { key: 'dark', active: c.code('TOO_DARK'), holdMs: LIGHT_CODE_HOLD_MS, message: NUDGE.dark },
  { key: 'bright', active: c.code('TOO_BRIGHT'), holdMs: LIGHT_CODE_HOLD_MS, message: NUDGE.bright },
  {
    key: 'backlit',
    active: c.backlightRatio === null ? null : c.backlightRatio < BACKLIGHT_RATIO[c.sensitivity],
    holdMs: BACKLIGHT_HOLD_MS,
    message: NUDGE.backlit,
  },
  {
    key: 'faceDark',
    active: c.faceLum === null ? null : c.faceLum < FACE_DARK_LUM,
    holdMs: BACKLIGHT_HOLD_MS,
    message: NUDGE.dark,
  },
];

export const distance = (c: CheckContext): Condition[] => [
  {
    key: 'mouth',
    active: c.mouthWidth === null ? null : c.mouthWidth < MOUTH_WIDTH_MIN[c.sensitivity],
    holdMs: DISTANCE_HOLD_MS,
    message: NUDGE.distance,
  },
  { key: 'code', active: c.code('FACE_TOO_FAR'), holdMs: DISTANCE_CODE_HOLD_MS, message: NUDGE.distance },
];

export const pace = (c: CheckContext): Condition[] => {
  const baseRate = c.baseline?.syllableRate ?? null;
  const out: Condition[] = [
    {
      key: 'rate',
      active: baseRate === null || c.paceRate === null ? null : c.paceRate > baseRate * PACE_RATIO[c.sensitivity],
      holdMs: 0, // the rate is already measured over a 10 s talking window
      message: NUDGE.pace,
    },
  ];
  const baseHigh = c.baseline?.apertureHigh ?? null;
  out.push({
    key: 'exaggeration',
    active: baseHigh === null || c.peakHeight === null ? null : c.peakHeight > baseHigh * EXAGGERATION_RATIO,
    holdMs: 3000,
    message: NUDGE.exaggeration,
  });
  return out;
};

export const occlusion = (c: CheckContext): Condition[] => {
  const base = c.baseline?.mouthLumRatio ?? null;
  return [
    {
      key: 'lum',
      active: base === null || c.mouthLumRatio === null ? null : Math.abs(c.mouthLumRatio - base) > OCCLUSION_LUM_DELTA,
      holdMs: OCCLUSION_HOLD_MS,
      message: NUDGE.occlusion,
    },
    { key: 'reset', active: c.landmarkReset, holdMs: OCCLUSION_HOLD_MS, message: NUDGE.occlusion },
  ];
};

export const phrase = (c: CheckContext): Condition[] => [
  {
    key: 'run',
    active: c.talkRunMs === null ? null : c.talkRunMs >= PHRASE_MAX_RUN_MS,
    holdMs: 0,
    message: NUDGE.phrase,
  },
];

export const CHECKS: CheckTable = { facing, light, distance, pace, occlusion, phrase };
