// Shared types for every Legible window and the main process.
// Nothing here imports Electron or the SDK, so the pure engine can be unit-tested.

/** The four checks on the strip, plus two optional ones. Order = priority. */
export const CHECK_PRIORITY = ['facing', 'light', 'distance', 'pace', 'occlusion', 'phrase'] as const;
export type CheckId = (typeof CHECK_PRIORITY)[number];
export const STRIP_CHECKS = ['facing', 'light', 'distance', 'pace'] as const;
export type StripCheckId = (typeof STRIP_CHECKS)[number];

/** A check never says "issue" unless it has the data to say so. */
export type CheckStatus = 'ok' | 'issue' | 'unknown';

/** What a light shows. */
export type LightState =
  | 'listening' // not speaking: nothing is judged
  | 'good' // speaking and this check is fine
  | 'issue' // the active nudge
  | 'unknown' // speaking but the check has no reliable data
  | 'untracked' // face not tracked / camera off
  | 'disabled'; // switched off in settings

export interface Point {
  x: number;
  y: number;
}

/**
 * The numbers Legible keeps from one landmark frame. The SDK gives 478 points;
 * Legible keeps only these. This is also exactly what the recorder stores, so
 * recordings are numbers-only and replay reproduces the same features.
 */
export interface FaceSample {
  /** ms since session start */
  t: number;
  frameW: number;
  frameH: number;
  stable: boolean;
  reset: boolean;
  nose: Point;
  eyeOuterL: Point; // index 33
  eyeOuterR: Point; // index 263
  mouthL: Point; // index 61
  mouthR: Point; // index 291
  lipTop: Point; // index 13
  lipBottom: Point; // index 14
  /** bounding box of all 478 points, in pixels */
  box: { x: number; y: number; w: number; h: number };
}

/** Everything that can enter the analyser. Live and replay produce the same events. */
export type SensorEvent =
  | { kind: 'face'; sample: FaceSample }
  | { kind: 'talking'; t: number; detected: boolean; stable: boolean }
  | { kind: 'validation'; t: number; code: ValidationName; hint: string }
  | { kind: 'brightness'; t: number; faceLum: number; ringLum: number; mouthLum: number | null }
  | { kind: 'breath'; t: number; value: number; stable: boolean };

/** Validation codes by name (the SDK delivers integers; see windows/sensor/decode.ts). */
export type ValidationName =
  | 'OK'
  | 'NO_FACE_FOUND'
  | 'MULTIPLE_FACES_FOUND'
  | 'FACE_NOT_CENTERED'
  | 'FACE_SIZE_OUT_OF_RANGE'
  | 'TOO_DARK'
  | 'TOO_BRIGHT'
  | 'CHEST_NOT_VISIBLE'
  | 'CAMERA_TUNING'
  | 'FRAME_RATE_TOO_LOW'
  | 'EXCESSIVE_MOTION'
  | 'FACE_TOO_CLOSE'
  | 'FACE_TOO_FAR'
  | 'FACE_TOO_HIGH'
  | 'FACE_TOO_LOW'
  | 'FACE_NOT_FORWARD'
  | 'UNKNOWN';

export interface Baseline {
  version: 1;
  createdAt: string;
  /** median head yaw (degrees) while reading facing the camera */
  yawDeg: number;
  /** visible syllables per second of talking */
  syllableRate: number | null;
  /** typical inner-lip aperture range (p10..p90), normalised by eye distance */
  apertureLow: number;
  apertureHigh: number;
  /** mouth-region mean luminance relative to the face (for the experimental occlusion check) */
  mouthLumRatio: number | null;
  talkSeconds: number;
}

export type Sensitivity = 'low' | 'normal' | 'high';
export type StripPosition = 'top-center' | 'top-left' | 'top-right' | 'free';

export interface Settings {
  version: 1;
  consentGiven: boolean;
  deviceId: string | null;
  deviceLabel: string | null;
  checks: Record<CheckId, boolean>;
  sensitivity: Sensitivity;
  stripPosition: StripPosition;
  stripFree: { x: number; y: number } | null;
  tickSound: boolean;
  recordNumbers: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  version: 1,
  consentGiven: false,
  deviceId: null,
  deviceLabel: null,
  checks: { facing: true, light: true, distance: true, pace: false, occlusion: false, phrase: false },
  sensitivity: 'normal',
  stripPosition: 'top-center',
  stripFree: null,
  tickSound: false,
  recordNumbers: false,
};

export type SessionMode = 'live' | 'rehearsal' | 'replay';
export type Phase = 'off' | 'starting' | 'running' | 'stopping' | 'error';

export interface Nudge {
  check: CheckId;
  message: string;
  /** ms since session start */
  since: number;
}

export interface AppError {
  code: string;
  title: string;
  detail: string;
  action: string;
  actionId: 'retry' | 'setup' | 'obs-guide' | 'none';
  retryable: boolean;
}

/** One 5-second square of the panel timeline. */
export type TimelineCell = 'none' | 'listening' | 'good' | 'issue' | 'untracked';

export interface SessionTotals {
  elapsedMs: number;
  talkMs: number;
  trackedTalkMs: number;
  readableMs: number;
  issueMs: Record<CheckId, number>;
  nudges: Record<CheckId, number>;
}

/** The object the sensor broadcasts to every UI window (~10 Hz). */
export interface LegibleState {
  phase: Phase;
  mode: SessionMode | null;
  camOn: boolean;
  tracking: boolean;
  /** why not tracking, as a short line */
  trackingNote: string;
  speaking: boolean;
  lights: Record<StripCheckId, LightState>;
  checks: Record<CheckId, CheckStatus>;
  nudge: Nudge | null;
  /** the strip's one line */
  line: string;
  /** SDK hint for the current validation code, shown as-is in the panel */
  hint: string;
  error: AppError | null;
  totals: SessionTotals;
  timeline: Record<StripCheckId, TimelineCell[]>;
  /** for the mirror: mouth corners in normalised frame coordinates */
  mouth: { l: Point; r: Point; widthPct: number } | null;
  rehearsal: { sentence: number; total: number } | null;
  /** sensor loop rate, for the hidden-window throttling check */
  tickHz: number;
  replayName: string | null;
}

export interface ReceiptIssueLine {
  check: CheckId;
  seconds: number;
  nudges: number;
}

export interface Receipt {
  version: 1;
  id: string;
  kind: 'call' | 'practice' | 'replay';
  startedAt: string;
  endedAt: string;
  durationS: number;
  talkS: number;
  trackedTalkS: number;
  readableS: number;
  readablePct: number | null;
  topIssue: CheckId | null;
  issues: ReceiptIssueLine[];
  nudgeCount: number;
  tip: string;
  kept: boolean;
}

/** Commands from UI windows to main. */
export type Command =
  | { type: 'start'; mode: SessionMode; setBaseline?: boolean }
  | { type: 'stop' }
  | { type: 'retry' }
  | { type: 'rehearsal-next' }
  | { type: 'rehearsal-redo' }
  | { type: 'open-panel'; tab?: PanelTab }
  | { type: 'close-panel' }
  | { type: 'open-setup'; screen?: SetupScreen }
  | { type: 'open-obs-guide' }
  | { type: 'mirror'; on: boolean };

export type PanelTab = 'now' | 'timeline' | 'mirror' | 'settings' | 'privacy';
export type SetupScreen = 'welcome' | 'consent' | 'setup' | 'rehearsal' | 'privacy' | 'obs' | 'why';

/** Messages main → sensor. */
export type SensorCommand =
  | {
      type: 'start';
      mode: SessionMode;
      deviceId: string | null;
      settings: Settings;
      baseline: Baseline | null;
      setBaseline: boolean;
      replaySpeed: number;
      /** numbers-only recording for replay mode */
      recording: unknown | null;
    }
  | { type: 'stop' }
  | { type: 'settings'; settings: Settings }
  | { type: 'rehearsal-next' }
  | { type: 'rehearsal-redo' };

/** Messages sensor → main (besides state). */
export type SensorReport =
  | { type: 'stopped'; receipt: Receipt | null; baseline: Baseline | null; recording: unknown | null }
  | { type: 'log'; event: string };
