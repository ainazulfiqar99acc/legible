// The analyser: SensorEvents in, a judged state out. Pure and deterministic given events and tick times,
// so live sessions, replay and unit tests all run exactly the same code.

import type {
  Baseline,
  CheckId,
  CheckStatus,
  LightState,
  Nudge,
  Point,
  SensorEvent,
  SessionMode,
  SessionTotals,
  Settings,
  StripCheckId,
  TimelineCell,
} from '../../shared/types';
import { STRIP_CHECKS } from '../../shared/types';
import { LINE, REHEARSAL_SENTENCES } from '../../shared/strings';
import {
  BRIGHTNESS_STALE_MS,
  DEFAULT_APERTURE_HIGH,
  DEFAULT_APERTURE_LOW,
  PHRASE_MIN_GAP_MS,
  REHEARSAL_MIN_TALK_S,
  YAW_MEDIAN_FRAMES,
} from '../../rules/thresholds';
import { SpeakingGate, ValidationTracker, trackingVerdict } from './gate';
import { MovingMedian, lipAperture, median, mouthWidthFraction, quantile, yawDegrees } from './features/geometry';
import { SyllableCounter } from './features/syllables';
import { CHECKS } from './checks';
import { CheckEvaluator, type CheckResults } from './checks/evaluate';
import type { CheckContext } from './checks/types';
import { NudgeEngine, type EngineEvent } from './nudgeEngine';
import { ReceiptLog } from './receiptLog';

export interface AnalyzerOptions {
  mode: SessionMode;
  settings: Settings;
  baseline: Baseline | null;
  setBaseline: boolean;
}

export interface AnalyzerOutput {
  tracking: boolean;
  trackingNote: string;
  speaking: boolean;
  lights: Record<StripCheckId, LightState>;
  checks: Record<CheckId, CheckStatus>;
  nudge: Nudge | null;
  line: string;
  hint: string;
  totals: SessionTotals;
  timeline: Record<StripCheckId, TimelineCell[]>;
  mouth: { l: Point; r: Point; widthPct: number } | null;
  rehearsal: { sentence: number; total: number } | null;
}

export type LogEvent =
  | EngineEvent
  | { t: number; type: 'tracking'; tracked: boolean; note: string }
  | { t: number; type: 'speaking'; speaking: boolean };

const APERTURE_HISTORY = 900; // ~30 s of talking frames

export class Analyzer {
  private settings: Settings;
  private readonly baseline: Baseline | null;
  private readonly gate = new SpeakingGate();
  private readonly validation = new ValidationTracker();
  private readonly yaw = new MovingMedian(YAW_MEDIAN_FRAMES);
  private readonly syllables: SyllableCounter;
  private readonly evaluator = new CheckEvaluator(CHECKS);
  readonly engine = new NudgeEngine();
  readonly receipt = new ReceiptLog();
  readonly log: LogEvent[] = [];

  private lastFaceT = Number.NEGATIVE_INFINITY;
  private lastResetT = Number.NEGATIVE_INFINITY;
  private yawDeg: number | null = null;
  private mouthW: number | null = null;
  private mouthPts: { l: Point; r: Point; frameW: number; frameH: number } | null = null;
  private brightness: { t: number; faceLum: number; ringLum: number; mouthLum: number | null } | null = null;
  private apertures: number[] = [];
  private lastRangeUpdate = 0;

  // phrase pauses
  private talkRunMs = 0;
  private silenceMs = 0;
  private breath: { t: number; value: number; stable: boolean }[] = [];
  private silenceStartBreath: number | null = null;
  private silenceMaxBreath = Number.NEGATIVE_INFINITY;

  // rehearsal collection
  private rehearsalYaw: number[] = [];
  private rehearsalAperture: number[] = [];
  private rehearsalMouthLum: number[] = [];
  private sentence = 0;

  private prevNow: number | null = null;
  private prevSpeaking = false;
  private prevTracked: boolean | null = null;
  private last: AnalyzerOutput | null = null;
  private readonly mode: SessionMode;
  private readonly collectBaseline: boolean;

  constructor(opts: AnalyzerOptions) {
    this.settings = opts.settings;
    this.baseline = opts.baseline;
    this.mode = opts.mode;
    this.collectBaseline = opts.mode === 'rehearsal' && opts.setBaseline;
    const lo = this.baseline?.apertureLow ?? DEFAULT_APERTURE_LOW;
    const hi = this.baseline?.apertureHigh ?? DEFAULT_APERTURE_HIGH;
    this.syllables = new SyllableCounter(lo, hi);
  }

  updateSettings(s: Settings): void {
    this.settings = s;
  }

  push(ev: SensorEvent): void {
    switch (ev.kind) {
      case 'face': {
        const s = ev.sample;
        this.lastFaceT = s.t;
        if (s.reset) {
          this.lastResetT = s.t;
          this.yaw.clear();
          this.syllables.interrupt();
        }
        const y = yawDegrees(s);
        this.yawDeg = y === null ? null : this.yaw.push(y);
        this.mouthW = mouthWidthFraction(s);
        this.mouthPts = { l: s.mouthL, r: s.mouthR, frameW: s.frameW, frameH: s.frameH };
        const a = lipAperture(s);
        const speakingNow = this.gate.speaking(s.t) && this.isTracked(s.t);
        if (a !== null && speakingNow) {
          this.syllables.pushAperture(s.t, a);
          this.apertures.push(a);
          if (this.apertures.length > APERTURE_HISTORY) this.apertures.shift();
          if (this.collectBaseline) {
            this.rehearsalAperture.push(a);
            if (this.yawDeg !== null) this.rehearsalYaw.push(this.yawDeg);
          }
        }
        break;
      }
      case 'talking':
        this.gate.push(ev.t, ev.detected);
        break;
      case 'validation':
        this.validation.push(ev.t, ev.code, ev.hint);
        break;
      case 'brightness':
        this.brightness = { t: ev.t, faceLum: ev.faceLum, ringLum: ev.ringLum, mouthLum: ev.mouthLum };
        if (this.collectBaseline && ev.mouthLum !== null && ev.faceLum > 0 && this.gate.speaking(ev.t)) {
          this.rehearsalMouthLum.push(ev.mouthLum / ev.faceLum);
        }
        break;
      case 'breath':
        this.breath.push({ t: ev.t, value: ev.value, stable: ev.stable });
        if (this.breath.length > 300) this.breath.shift();
        if (!this.gate.speaking(ev.t)) {
          if (this.silenceStartBreath === null) this.silenceStartBreath = ev.value;
          this.silenceMaxBreath = Math.max(this.silenceMaxBreath, ev.value);
        }
        break;
    }
  }

  private isTracked(now: number): boolean {
    return trackingVerdict(now, this.lastFaceT, this.validation).tracked;
  }

  tick(now: number): AnalyzerOutput {
    const dt = this.prevNow === null ? 0 : Math.max(0, now - this.prevNow);
    this.prevNow = now;
    const tv = trackingVerdict(now, this.lastFaceT, this.validation);
    const tracked = tv.tracked;
    // talking per the SDK, even when judgement is paused (e.g. a second face): counts as talk time
    const talking = this.gate.speaking(now);
    // judged speaking: only when tracked
    const speaking = tracked && talking;

    if (tracked !== this.prevTracked) this.log.push({ t: now, type: 'tracking', tracked, note: tv.note });
    if (speaking !== this.prevSpeaking) this.log.push({ t: now, type: 'speaking', speaking });

    // talk-time features
    if (speaking) {
      this.syllables.advance(dt, now - this.lastFaceT < 100);
    } else if (this.prevSpeaking) {
      this.syllables.interrupt();
    }
    this.updatePhrase(dt, speaking);
    this.maybeAdaptRange(now);

    const b = this.brightness && now - this.brightness.t <= BRIGHTNESS_STALE_MS ? this.brightness : null;
    const ctx: CheckContext = {
      now,
      speaking,
      tracked,
      sensitivity: this.settings.sensitivity,
      baseline: this.baseline,
      yawDeg: now - this.lastResetT < 200 ? null : this.yawDeg,
      mouthWidth: this.mouthW,
      backlightRatio: b && Number.isFinite(b.ringLum) && b.ringLum > 1 ? b.faceLum / b.ringLum : null,
      faceLum: b ? b.faceLum : null,
      mouthLumRatio: b && b.mouthLum !== null && b.faceLum > 0 ? b.mouthLum / b.faceLum : null,
      paceRate: this.syllables.windowRate(),
      peakHeight: this.syllables.windowPeakHeight(),
      talkRunMs: this.phraseKnown(now) ? this.talkRunMs : null,
      landmarkReset: now - this.lastResetT < 1000,
      code: (name) => this.validation.current === name,
    };
    const results: CheckResults = this.evaluator.evaluate(ctx, this.settings.checks);
    const before = this.engine.events.length;
    const nudge = this.engine.update(now, results, tracked);
    let newNudge: CheckId | null = null;
    for (let i = before; i < this.engine.events.length; i++) {
      const e = this.engine.events[i]!;
      this.log.push(e);
      if (e.type === 'nudge') newNudge = e.check;
    }
    this.receipt.tick({ now, speaking: talking, tracked, results, newNudge });

    const lights = {} as Record<StripCheckId, LightState>;
    for (const id of STRIP_CHECKS) {
      lights[id] = !this.settings.checks[id]
        ? 'disabled'
        : !tracked
          ? 'untracked'
          : !speaking
            ? 'listening'
            : nudge?.check === id
              ? 'issue'
              : results[id].status === 'ok'
                ? 'good'
                : 'unknown';
    }
    const checks = {} as Record<CheckId, CheckStatus>;
    for (const id of Object.keys(results) as CheckId[]) checks[id] = results[id].status;

    const line = !tracked ? tv.note : nudge ? nudge.message : speaking ? LINE.readable : LINE.listening;
    const mp = this.mouthPts;
    const out: AnalyzerOutput = {
      tracking: tracked,
      trackingNote: tv.note,
      speaking,
      lights,
      checks,
      nudge: nudge ? { ...nudge } : null,
      line,
      hint: this.validation.hint,
      totals: structuredClone(this.receipt.totals),
      timeline: this.receipt.timelineSnapshot(),
      mouth:
        mp && tracked && mp.frameW > 0
          ? {
              l: { x: mp.l.x / mp.frameW, y: mp.l.y / mp.frameH },
              r: { x: mp.r.x / mp.frameW, y: mp.r.y / mp.frameH },
              widthPct: (this.mouthW ?? 0) * 100,
            }
          : null,
      rehearsal: this.mode === 'rehearsal' ? { sentence: this.sentence + 1, total: REHEARSAL_SENTENCES.length } : null,
    };
    this.prevSpeaking = speaking;
    this.prevTracked = tracked;
    this.last = out;
    return out;
  }

  /** Before a baseline exists, learn the aperture range from this session so peaks scale to this face. */
  private maybeAdaptRange(now: number): void {
    if (this.baseline || now - this.lastRangeUpdate < 1000 || this.apertures.length < 90) return;
    this.lastRangeUpdate = now;
    const lo = quantile(this.apertures, 0.1)!;
    const hi = quantile(this.apertures, 0.9)!;
    if (hi - lo > 0.01) this.syllables.setRange(lo, hi);
  }

  private phraseKnown(now: number): boolean {
    if (!this.settings.checks.phrase) return false;
    const last = this.breath[this.breath.length - 1];
    return !!last && last.stable && now - last.t < 2000;
  }

  private updatePhrase(dt: number, speaking: boolean): void {
    if (speaking) {
      if (this.silenceMs > 0) {
        // a gap just ended: was it a breath pause?
        const inhaled =
          this.silenceStartBreath !== null && this.silenceMaxBreath - this.silenceStartBreath > 0 && this.silenceMs >= PHRASE_MIN_GAP_MS;
        if (inhaled) this.talkRunMs = 0;
        this.silenceMs = 0;
        this.silenceStartBreath = null;
        this.silenceMaxBreath = Number.NEGATIVE_INFINITY;
      }
      this.talkRunMs += dt;
    } else {
      this.silenceMs += dt;
      // a long silence always ends the run, breath or not
      if (this.silenceMs >= 2000) this.talkRunMs = 0;
    }
  }

  // ---- rehearsal ------------------------------------------------------------------
  rehearsalNext(): boolean {
    this.sentence++;
    return this.sentence >= REHEARSAL_SENTENCES.length;
  }

  rehearsalRedo(): void {
    /* the same sentence is read again; collected numbers are kept (more data, same baseline) */
  }

  buildBaseline(): Baseline | null {
    if (!this.collectBaseline) return null;
    const talkS = this.syllables.totalValidTalkMs / 1000;
    if (talkS < REHEARSAL_MIN_TALK_S || this.rehearsalYaw.length < 30) return null;
    return {
      version: 1,
      createdAt: new Date().toISOString(),
      yawDeg: median(this.rehearsalYaw) ?? 0,
      syllableRate: this.syllables.overallRate(),
      apertureLow: quantile(this.rehearsalAperture, 0.1) ?? DEFAULT_APERTURE_LOW,
      apertureHigh: quantile(this.rehearsalAperture, 0.9) ?? DEFAULT_APERTURE_HIGH,
      mouthLumRatio: median(this.rehearsalMouthLum),
      talkSeconds: Math.round(talkS),
    };
  }

  finish(now: number): void {
    this.engine.stop(now);
    for (const e of this.engine.events.slice(-1)) if (e.type === 'clear' && e.reason === 'stopped') this.log.push(e);
  }

  get output(): AnalyzerOutput | null {
    return this.last;
  }
}
