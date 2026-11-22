// Every number that decides when Legible speaks up lives here.
// Values marked "TUNE" were set from the plan and the synthetic fixtures; re-check them
// against real Stage 1 recordings (see docs/SDK-NOTES.md, "Open measurements").

import type { Sensitivity } from '../shared/types';

/** MediaPipe Face Mesh indices (478-point model). TUNE: confirm with the landmark overlay in the Mirror tab. */
export const LANDMARK = {
  noseTip: 1,
  eyeOuterL: 33,
  eyeOuterR: 263,
  mouthL: 61,
  mouthR: 291,
  lipTop: 13,
  lipBottom: 14,
} as const;
export const LANDMARK_COUNT = 478;

// ---- Speaking gate -------------------------------------------------------------
/**
 * talking.detected must be false this long before we call it "not speaking" (stops flicker mid-word).
 * Real data (HP Wide Vision, 22 Nov): talking runs median 0.37 s, gaps median 0.18 s, p75 0.8 s while talking
 * continuously. 400 ms left the gate flickering; 700 ms bridges most gaps between words.
 */
export const SPEAKING_HANGOVER_MS = 700;
/**
 * Hold timers ("for 3 s while speaking") survive a pause in speech this long, instead of restarting at every
 * breath. Nothing is judged during the pause itself; the timers are cleared at once when tracking is lost.
 */
export const HOLD_GAP_TOLERANCE_MS = 1500;

// ---- Tracking gate -------------------------------------------------------------
/** No landmark frame for this long = not tracking. A covered lens must show "Not tracking" within 1 s. */
export const LANDMARK_STALE_MS = 600;
/** NO_FACE_FOUND must persist this long before tracking is dropped (flicker guard). */
export const LOST_FACE_DEBOUNCE_MS = 300;
/**
 * MULTIPLE_FACES_FOUND must persist this long before judging pauses. Real data: six single-frame (31–78 ms)
 * false reports in 3 minutes alone at a desk; a real second face persists far longer. Still well under a second.
 */
export const MULTI_FACE_DEBOUNCE_MS = 250;
/** Any other validation code must persist this long before a check may use it. The SDK docs warn borderline states flicker. */
export const VALIDATION_DEBOUNCE_MS = 500;

// ---- Facing ----------------------------------------------------------------------
/**
 * Yaw from landmarks: nose-tip offset from the eye-corner midpoint, divided by eye-corner distance,
 * then atan(ratio / NOSE_DEPTH_RATIO). 0.45 ~ nose-tip depth / outer-canthus width for adults. TUNE at 0/15/30 degrees.
 */
export const NOSE_DEPTH_RATIO = 0.45;
/** Head yaw away from the rehearsal baseline that counts as "turned away". */
export const FACING_YAW_DEG: Record<Sensitivity, number> = { low: 25, normal: 20, high: 15 };
/** How long the yaw must stay over the limit while speaking. */
export const FACING_YAW_HOLD_MS = 1000;
/** How long FACE_NOT_FORWARD must last while speaking. */
export const FACING_CODE_HOLD_MS = 1500;
/** Smoothing for yaw: moving median over this many landmark frames (~30 Hz). */
export const YAW_MEDIAN_FRAMES = 5;

// ---- Light -----------------------------------------------------------------------
/** TOO_DARK / TOO_BRIGHT hold while speaking. */
export const LIGHT_CODE_HOLD_MS = 1500;
/** face luminance / background-ring luminance below this = backlit. */
// Real data (22 Nov, desk with normal room light): 0.55–0.65 when well lit, so 0.6 nudged constantly. TUNE further.
export const BACKLIGHT_RATIO: Record<Sensitivity, number> = { low: 0.36, normal: 0.42, high: 0.48 };
/** backlight must persist this long while speaking. */
export const BACKLIGHT_HOLD_MS = 3000;
/** Face mean luminance (0..255) below this = "too dark". Real data: ~75 lit, 22–30 with the room light off. */
export const FACE_DARK_LUM = 45;
/** Frame probe: sample rate and size. */
export const PROBE_INTERVAL_MS = 500;
export const PROBE_W = 160;
export const PROBE_H = 90;
/** A brightness reading older than this is unknown (the probe stalled). */
export const BRIGHTNESS_STALE_MS = 1500;
/** The background ring extends this fraction of the face box beyond each side. */
export const RING_MARGIN = 0.6;

// ---- Distance --------------------------------------------------------------------
/** Mouth width (corner to corner) as a fraction of frame width. Below = too far for lip-reading. */
// Real data (HP Wide Vision 1280x720, a wide-angle laptop camera): 5–6.6% at a normal seat, 1.6–2.1% leaning far back.
export const MOUTH_WIDTH_MIN: Record<Sensitivity, number> = { low: 0.03, normal: 0.035, high: 0.04 };
export const DISTANCE_HOLD_MS = 3000;
/** FACE_TOO_FAR from the SDK counts with this hold. */
export const DISTANCE_CODE_HOLD_MS = 1500;

// ---- Pace ------------------------------------------------------------------------
/** Moving-average window for the lip aperture (frames at ~30 Hz). */
export const APERTURE_SMOOTH_FRAMES = 3;
/** A peak must rise this fraction of the user's typical aperture range above the neighbouring troughs. */
export const PEAK_PROMINENCE = 0.3;
/** Minimum time between two counted peaks (no human makes > 8 visible syllables per second). */
export const PEAK_MIN_GAP_MS = 120;
/** Rate is measured over the last this-much talking time. */
export const PACE_WINDOW_MS = 10_000;
/** Ratio to the rehearsal baseline that counts as rushing. */
export const PACE_RATIO: Record<Sensitivity, number> = { low: 1.45, normal: 1.3, high: 1.2 };
/** At least this share of the window must have valid landmark frames. */
export const PACE_MIN_VALID = 0.8;
/** Default aperture range before a baseline exists (normalised by eye distance). TUNE. */
export const DEFAULT_APERTURE_LOW = 0.02;
export const DEFAULT_APERTURE_HIGH = 0.22;

// ---- Occlusion (experimental, off by default) -------------------------------------
/** Mouth-region / face luminance ratio change from the baseline that suggests a hand over the mouth. */
export const OCCLUSION_LUM_DELTA = 0.25;
export const OCCLUSION_HOLD_MS = 1500;

// ---- Phrase pauses (F12, conditional) ----------------------------------------------
export const PHRASE_MAX_RUN_MS = 25_000;
/** A talking gap at least this long with an inhale counts as a breath pause. */
export const PHRASE_MIN_GAP_MS = 250;

// ---- Exaggeration (P2) -------------------------------------------------------------
export const EXAGGERATION_RATIO = 1.8;

// ---- Nudge engine ------------------------------------------------------------------
/** A nudge clears after this long without its issue. */
export const NUDGE_CLEAR_MS = 2000;
/** At most one new nudge per this interval. */
export const NUDGE_MIN_INTERVAL_MS = 5000;
/** The same nudge does not repeat within this interval... */
export const NUDGE_REPEAT_MS = 30_000;
/** ...unless the previous one lasted longer than this. */
export const NUDGE_REPEAT_EXEMPT_MS = 10_000;

// ---- Rehearsal ---------------------------------------------------------------------
export const REHEARSAL_MIN_TALK_S = 8;

// ---- Timeline ----------------------------------------------------------------------
export const TIMELINE_CELL_MS = 5000;
export const TIMELINE_CELLS = 60; // 5 minutes

// ---- Sensor loop -------------------------------------------------------------------
export const TICK_MS = 33; // ~30 Hz
export const BROADCAST_MS = 100; // UI state at 10 Hz
