// Visible-syllable counter: peaks in the smoothed inner-lip aperture, counted only while speaking.
// Rate = peaks per second of *talking* time over a rolling window, so silences do not dilute it.

import {
  APERTURE_SMOOTH_FRAMES,
  PEAK_MIN_GAP_MS,
  PEAK_PROMINENCE,
  PACE_WINDOW_MS,
  PACE_MIN_VALID,
} from '../../../rules/thresholds';

interface Slice {
  talkClock: number; // talk-time at the end of the slice
  dt: number;
  valid: boolean;
}

export class SyllableCounter {
  private smooth: number[] = [];
  /** online peak detector state */
  private trough = Number.POSITIVE_INFINITY;
  private candidate = Number.NEGATIVE_INFINITY;
  private rising = true;
  private lastPeakT = Number.NEGATIVE_INFINITY;

  private talkClock = 0;
  private peaks: { talkClock: number; height: number }[] = [];
  private slices: Slice[] = [];
  totalPeaks = 0;
  totalValidTalkMs = 0;
  /** all peak heights (for rehearsal / exaggeration) */
  private heights: number[] = [];

  constructor(private low: number, private high: number) {}

  setRange(low: number, high: number): void {
    this.low = low;
    this.high = high;
  }

  get prominence(): number {
    return Math.max(1e-4, (this.high - this.low) * PEAK_PROMINENCE);
  }

  /** Feed one aperture value taken while the user is speaking and tracked. */
  pushAperture(t: number, aperture: number): void {
    this.smooth.push(aperture);
    if (this.smooth.length > APERTURE_SMOOTH_FRAMES) this.smooth.shift();
    const v = this.smooth.reduce((a, b) => a + b, 0) / this.smooth.length;
    const p = this.prominence;
    if (this.rising) {
      if (v < this.trough) {
        // still falling into the trough before the next rise
        this.trough = v;
        this.candidate = v;
      }
      if (v > this.candidate) this.candidate = v;
      if (this.candidate - this.trough >= p && this.candidate - v >= p) {
        // confirmed a peak: it rose by p from the trough and has now fallen by p
        if (t - this.lastPeakT >= PEAK_MIN_GAP_MS) {
          this.peaks.push({ talkClock: this.talkClock, height: this.candidate });
          this.heights.push(this.candidate);
          this.totalPeaks++;
          this.lastPeakT = t;
        }
        this.rising = false;
        this.trough = v;
      }
    } else {
      if (v < this.trough) this.trough = v;
      if (v - this.trough >= p) {
        this.rising = true;
        this.candidate = v;
      }
    }
  }

  /** Break the peak state (speech stopped, landmarks reset). */
  interrupt(): void {
    this.smooth = [];
    this.trough = Number.POSITIVE_INFINITY;
    this.candidate = Number.NEGATIVE_INFINITY;
    this.rising = true;
  }

  /** Advance talk time by dt ms of speaking; valid = landmark frames were flowing. */
  advance(dt: number, valid: boolean): void {
    if (dt <= 0) return;
    this.talkClock += dt;
    if (valid) this.totalValidTalkMs += dt;
    this.slices.push({ talkClock: this.talkClock, dt, valid });
    const cutoff = this.talkClock - PACE_WINDOW_MS;
    while (this.slices.length && this.slices[0]!.talkClock <= cutoff) this.slices.shift();
    while (this.peaks.length && this.peaks[0]!.talkClock <= cutoff) this.peaks.shift();
  }

  /** Visible syllables per second of talking over the last window, or null if not enough data. */
  windowRate(): number | null {
    if (this.talkClock < PACE_WINDOW_MS) return null;
    let validMs = 0;
    for (const s of this.slices) if (s.valid) validMs += s.dt;
    if (validMs < PACE_WINDOW_MS * PACE_MIN_VALID) return null;
    return this.peaks.length / (validMs / 1000);
  }

  /** Median peak height in the window (for the exaggeration hint). */
  windowPeakHeight(): number | null {
    if (this.peaks.length < 5) return null;
    const s = this.peaks.map((p) => p.height).sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)]!;
  }

  overallRate(): number | null {
    if (this.totalValidTalkMs < 3000) return null;
    return this.totalPeaks / (this.totalValidTalkMs / 1000);
  }

  get talkMs(): number {
    return this.talkClock;
  }
}
