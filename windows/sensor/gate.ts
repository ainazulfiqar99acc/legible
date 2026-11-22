// Quality gate: decides whether Legible may judge at all.
// - speaking: talking.detected, with a hangover so gaps between words do not flicker
// - tracking: recent landmarks, one face, face found (debounced)
// - validation codes: debounced, because the SDK docs warn borderline states flicker

import type { ValidationName } from '../../shared/types';
import { LINE } from '../../shared/strings';
import {
  LANDMARK_STALE_MS,
  LOST_FACE_DEBOUNCE_MS,
  MULTI_FACE_DEBOUNCE_MS,
  SPEAKING_HANGOVER_MS,
  VALIDATION_DEBOUNCE_MS,
} from '../../rules/thresholds';

export class SpeakingGate {
  private lastTrueT = Number.NEGATIVE_INFINITY;
  private lastEventT = Number.NEGATIVE_INFINITY;
  private detected = false;

  push(t: number, detected: boolean): void {
    this.lastEventT = t;
    this.detected = detected;
    if (detected) this.lastTrueT = t;
  }

  /** Speaking = detected now, or detected within the hangover. Unknown (no recent talking data) = not speaking. */
  speaking(now: number): boolean {
    if (now - this.lastEventT > LANDMARK_STALE_MS) return false;
    return this.detected || now - this.lastTrueT <= SPEAKING_HANGOVER_MS;
  }

  reset(): void {
    this.lastTrueT = Number.NEGATIVE_INFINITY;
    this.lastEventT = Number.NEGATIVE_INFINITY;
    this.detected = false;
  }
}

/** Keeps the current validation code and how long it has been held. */
export class ValidationTracker {
  private code: ValidationName = 'OK';
  private since = 0;
  hint = '';

  push(t: number, code: ValidationName, hint: string): void {
    if (code !== this.code) {
      this.code = code;
      this.since = t;
    }
    this.hint = code === 'OK' ? '' : hint;
  }

  /** True when `code` is the current code and has been for at least `ms` (default: debounce). */
  holds(code: ValidationName, now: number, ms = VALIDATION_DEBOUNCE_MS): boolean {
    return this.code === code && now - this.since >= ms;
  }

  /** How long the current code has been active, if it is `code`. */
  heldFor(code: ValidationName, now: number): number {
    return this.code === code ? now - this.since : 0;
  }

  get current(): ValidationName {
    return this.code;
  }
}

export interface TrackingVerdict {
  tracked: boolean;
  note: string;
}

export function trackingVerdict(now: number, lastFaceT: number, validation: ValidationTracker): TrackingVerdict {
  // A second face pauses judgement within MULTI_FACE_DEBOUNCE_MS (single-frame false reports are ignored).
  if (validation.holds('MULTIPLE_FACES_FOUND', now, MULTI_FACE_DEBOUNCE_MS)) {
    return { tracked: false, note: LINE.multipleFaces };
  }
  if (validation.holds('NO_FACE_FOUND', now, LOST_FACE_DEBOUNCE_MS)) {
    return { tracked: false, note: LINE.noFace };
  }
  if (now - lastFaceT > LANDMARK_STALE_MS) {
    return { tracked: false, note: LINE.noFace };
  }
  return { tracked: true, note: '' };
}
