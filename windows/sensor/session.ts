// One sensing session in the hidden sensor window: camera → SDK → analyser → state broadcast.
// Replay mode skips the camera and the SDK and feeds a recording through the same analyser.

import type { AppError, FaceSample, LegibleState, Receipt, SensorCommand, SensorEvent, Settings } from '../../shared/types';
import type { SensorApi } from '../../shared/ipc';
import { describeError, LINE } from '../../shared/strings';
import { BROADCAST_MS, TICK_MS } from '../../rules/thresholds';
import { Analyzer, type AnalyzerOutput } from './analyzer';
import { Recorder, isRecording, type Recording } from './record';
import { ReplayPlayer, replaySettings } from './replay';
import { FrameProbe } from './frameProbe';
import { SdkClient, sdkErrorName } from './sdk';

type StartCmd = Extract<SensorCommand, { type: 'start' }>;

export class Session {
  private readonly analyzer: Analyzer;
  private readonly recorder: Recorder;
  private readonly t0 = performance.now();
  private stream: MediaStream | null = null;
  private video: HTMLVideoElement | null = null;
  private sdk: SdkClient | null = null;
  private probe: FrameProbe | null = null;
  private player: ReplayPlayer | null = null;
  private loop: ReturnType<typeof setInterval> | null = null;
  private phase: LegibleState['phase'] = 'starting';
  private error: AppError | null = null;
  private latestFace: FaceSample | null = null;
  private faceSeen = false;
  private lastPublish = 0;
  private lastLine = '';
  private ticks: number[] = [];
  private out: AnalyzerOutput | null = null;
  private settings: Settings;
  private stopped = false;
  private readonly startedAt = new Date();

  constructor(private readonly cmd: StartCmd, private readonly api: SensorApi) {
    const rec = cmd.mode === 'replay' && isRecording(cmd.recording) ? (cmd.recording as Recording) : null;
    this.settings = rec ? replaySettings(rec, cmd.settings) : cmd.settings;
    this.analyzer = new Analyzer({
      mode: cmd.mode,
      settings: this.settings,
      baseline: rec ? rec.baseline : cmd.baseline,
      setBaseline: cmd.setBaseline,
    });
    this.recorder = new Recorder(cmd.mode !== 'replay' && cmd.settings.recordNumbers);
    if (rec) this.player = new ReplayPlayer(rec, cmd.replaySpeed);
  }

  /** ms since the session started (scaled in replay) */
  now = (): number => {
    const wall = performance.now() - this.t0;
    return this.player ? this.player.sessionMs(wall) : wall;
  };

  async start(): Promise<void> {
    this.publish(true);
    if (this.player) {
      this.phase = 'running';
      this.loop = setInterval(() => this.tick(), TICK_MS);
      return;
    }
    const key = await this.api.getKey();
    if (!key) return this.fail('noKey', '', false);

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: false, // never the microphone
        video: {
          ...(this.cmd.deviceId ? { deviceId: { exact: this.cmd.deviceId } } : {}),
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 },
        },
      });
    } catch (e) {
      return this.fail((e as DOMException).name || 'NotReadableError', (e as Error).message ?? '', true);
    }
    if (this.stopped) return this.releaseCamera();
    const track = this.stream.getVideoTracks()[0]!;
    track.addEventListener('ended', () => this.fail('kInputUnavailable', 'The camera was disconnected.', true));
    const st = track.getSettings();
    const frameW = st.width ?? 1280;
    const frameH = st.height ?? 720;

    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.srcObject = this.stream;
    this.video = video;
    void video.play().catch(() => undefined);

    this.sdk = new SdkClient({
      onEvents: (evs) => evs.forEach((e) => this.ingest(e)),
      onError: (code, message, retryable) => void this.fail(code, message, retryable),
      onRunning: () => this.api.report({ type: 'log', event: 'sdk running' }),
      onDiag: (event) => this.api.report({ type: 'log', event }),
    });
    this.loop = setInterval(() => this.tick(), TICK_MS);
    try {
      await this.sdk.start({ apiKey: key, stream: this.stream, frameW, frameH, breathing: this.settings.checks.phrase, sessionNow: this.now });
    } catch (e) {
      return this.fail(sdkErrorName(e) ?? 'kConfigurationFailed', (e as Error).message ?? '', !!(e as { retryable?: boolean }).retryable);
    }
    if (this.stopped) return;
    this.probe = new FrameProbe(video, () => this.latestFace, this.now, (e) => this.ingest(e));
    this.probe.start();
    this.phase = 'running';
  }

  private ingest(e: SensorEvent): void {
    if (e.kind === 'face') {
      this.latestFace = e.sample;
      this.faceSeen = true;
    }
    this.recorder.push(e);
    this.analyzer.push(e);
  }

  private tick(): void {
    const now = this.now();
    if (this.player) {
      this.player.drain(now, (e) => this.ingest(e));
      if (this.player.done(now)) {
        void this.stop();
        return;
      }
    }
    this.out = this.analyzer.tick(now);
    const wall = performance.now();
    this.ticks.push(wall);
    while (this.ticks.length && wall - this.ticks[0]! > 1000) this.ticks.shift();
    this.publish(false);
  }

  private publish(force: boolean): void {
    const s = this.state();
    const t = performance.now();
    if (!force && s.line === this.lastLine && t - this.lastPublish < BROADCAST_MS) return;
    this.lastPublish = t;
    this.lastLine = s.line;
    this.api.sendState(s);
  }

  private state(): LegibleState {
    const o = this.out;
    const base: LegibleState = {
      phase: this.phase,
      mode: this.cmd.mode,
      camOn: !!this.stream && this.stream.getVideoTracks().some((tr) => tr.readyState === 'live'),
      tracking: o?.tracking ?? false,
      trackingNote: o?.trackingNote ?? '',
      speaking: o?.speaking ?? false,
      lights: o?.lights ?? { facing: 'untracked', light: 'untracked', distance: 'untracked', pace: 'untracked' },
      checks: o?.checks ?? { facing: 'unknown', light: 'unknown', distance: 'unknown', pace: 'unknown', occlusion: 'unknown', phrase: 'unknown' },
      nudge: o?.nudge ?? null,
      line: o?.line ?? LINE.starting,
      hint: o?.hint ?? '',
      error: this.error,
      totals: o?.totals ?? this.analyzer.receipt.totals,
      timeline: o?.timeline ?? { facing: [], light: [], distance: [], pace: [] },
      mouth: o?.mouth ?? null,
      rehearsal: o?.rehearsal ?? null,
      tickHz: this.ticks.length,
      replayName: this.player ? this.player.rec.name : null,
    };
    if (this.error) {
      base.line = this.error.title;
      base.nudge = null;
      base.lights = { facing: 'untracked', light: 'untracked', distance: 'untracked', pace: 'untracked' };
    } else if (this.phase === 'starting' || (!this.faceSeen && !this.player && this.now() < 8000)) {
      base.line = this.phase === 'starting' ? LINE.starting : 'Looking for your face…';
    }
    return base;
  }

  /** A fatal problem: release the camera at once, keep the numbers so Stop can still show a receipt. */
  private async fail(code: string, message: string, retryable: boolean): Promise<void> {
    if (this.stopped || this.error) return;
    this.error = describeError(code, message, retryable);
    this.phase = 'error';
    this.api.report({ type: 'log', event: `error ${code}` });
    await this.releaseCamera();
    this.publish(true);
  }

  private async releaseCamera(): Promise<void> {
    // tracks first: the camera light goes off immediately
    this.stream?.getTracks().forEach((t) => t.stop());
    if (this.video) {
      this.video.pause();
      this.video.srcObject = null;
    }
    this.probe?.stop();
    this.probe = null;
    const sdk = this.sdk;
    this.sdk = null;
    await sdk?.shutdown();
  }

  updateSettings(s: Settings): void {
    if (this.player) return; // replay keeps the recording's settings
    this.settings = s;
    this.analyzer.updateSettings(s);
  }

  rehearsalNext(): void {
    if (this.analyzer.rehearsalNext()) void this.stop();
  }

  rehearsalRedo(): void {
    this.analyzer.rehearsalRedo();
  }

  async stop(): Promise<void> {
    if (this.stopped) return;
    this.stopped = true;
    this.phase = 'stopping';
    if (this.loop) clearInterval(this.loop);
    this.loop = null;
    await this.releaseCamera();
    const now = this.now();
    this.analyzer.finish(now);
    const kind: Receipt['kind'] = this.cmd.mode === 'live' ? 'call' : this.cmd.mode === 'rehearsal' ? 'practice' : 'replay';
    const totals = this.analyzer.receipt.totals;
    const receipt = totals.elapsedMs > 3000 ? this.analyzer.receipt.build(kind, this.startedAt, new Date()) : null;
    const baseline = this.analyzer.buildBaseline();
    const recording = this.recorder.finish(`session-${this.startedAt.toISOString()}`, Math.round(now), baseline ?? this.cmd.baseline);
    this.api.report({ type: 'stopped', receipt, baseline, recording });
  }
}
