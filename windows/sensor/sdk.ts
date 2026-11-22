// SmartSpectra integration. Everything Legible asks of the SDK is in this file.
//
// Verified against @smartspectra/node-sdk 3.5.0 (js/renderer/index.d.ts, js/index.d.ts, js/messages/index.d.ts):
//   new SmartSpectraSDK(options: RendererSmartSpectraOptions)  — apiKey, requestedMetrics, enableTelemetry
//   sdk.useMediaStream(stream)           — host-owned stream; the SDK never stops its tracks
//   sdk.on('metrics', (buf: Uint8Array, timestampUs) => …)
//   sdk.on('validationStatus', (code, timestampUs, hint) => …)
//   sdk.on('error', (code, message, retryable) => …)
//   sdk.on('processingStatus', (status) => …)
//   await sdk.start(); await sdk.stop(); sdk.destroy()   — renderer stop() is async (no stopAsync on the renderer class)
//   decodeMetrics(buf) from '@smartspectra/node-sdk/messages'
// Never called: requestInsight. enableTelemetry is always false.

import {
  SmartSpectraSDK,
  MetricType,
  breathingMetrics,
  SmartSpectraErrorCode,
  ProcessingStatus,
} from '@smartspectra/node-sdk/renderer';
import { decodeMetrics } from '@smartspectra/node-sdk/messages';
import type { SensorEvent } from '../../shared/types';
import { metricsToEvents, validationName, type PlainMetrics } from './decode';
import { LANDMARK_COUNT } from '../../rules/thresholds';

const ERROR_NAMES: Record<number, string> = Object.fromEntries(
  Object.entries(SmartSpectraErrorCode).map(([name, code]) => [code as number, name]),
);

export interface SdkHandlers {
  onEvents(events: SensorEvent[]): void;
  onError(code: string, message: string, retryable: boolean): void;
  onRunning(): void;
  /** one-off diagnostics (numbers about the stream shape only, never values per frame) */
  onDiag(event: string): void;
}

export interface SdkStartOptions {
  apiKey: string;
  stream: MediaStream;
  frameW: number;
  frameH: number;
  breathing: boolean;
  /** maps a performance.now() reading to session ms */
  sessionNow(): number;
}

/**
 * The SDK timestamps are absolute microseconds. Legible's analyser works in ms since session start.
 * We map them with an offset chosen so no event lands in the future: offset = max(eventMs - arrivalMs).
 * That removes the clock base and the smallest processing latency, keeping staleness checks honest.
 */
class Clock {
  private offset: number | null = null;
  constructor(private readonly sessionNow: () => number) {}
  toSessionMs = (us: number | null): number => {
    const arrival = this.sessionNow();
    if (us === null || !Number.isFinite(us)) return arrival;
    const ms = us / 1000;
    const cand = ms - arrival;
    if (this.offset === null || cand > this.offset) this.offset = cand;
    return ms - this.offset;
  };
}

export class SdkClient {
  private sdk: SmartSpectraSDK | null = null;
  private destroyed = false;

  constructor(private readonly h: SdkHandlers) {}

  async start(o: SdkStartOptions): Promise<void> {
    const requestedMetrics: number[] = [MetricType.FACE_LANDMARKS, MetricType.TALKING];
    if (o.breathing) requestedMetrics.push(...breathingMetrics);
    const sdk = new SmartSpectraSDK({
      apiKey: o.apiKey,
      requestedMetrics,
      enableTelemetry: false, // hard rule; logLevel left at the SDK default (warnings and errors)
    });
    this.sdk = sdk;
    const clock = new Clock(o.sessionNow);
    let shapeLogged = false;
    let talkLogged = false;

    sdk.on('metrics', (buf) => {
      if (this.destroyed) return;
      let m: PlainMetrics;
      try {
        m = decodeMetrics(buf) as unknown as PlainMetrics;
      } catch {
        return;
      }
      const lm = m.face?.landmarks?.[0]?.value;
      if (!shapeLogged && lm && lm.length) {
        // once per session: confirms the landmark model and coordinate space on this machine
        shapeLogged = true;
        const xs = lm.map((p) => p.x ?? 0);
        const ys = lm.map((p) => p.y ?? 0);
        const r = (v: number) => Math.round(v * 1000) / 1000;
        this.h.onDiag(
          `landmarks n=${lm.length}${lm.length < LANDMARK_COUNT ? ' (unexpected: need ' + LANDMARK_COUNT + ')' : ''} ` +
            `x=${r(Math.min(...xs))}..${r(Math.max(...xs))} y=${r(Math.min(...ys))}..${r(Math.max(...ys))} frame=${o.frameW}x${o.frameH}`,
        );
      }
      if (!talkLogged && m.face?.talking?.length) {
        talkLogged = true;
        this.h.onDiag('talking stream present');
      }
      const events = metricsToEvents(m, clock.toSessionMs, o.frameW, o.frameH);
      if (events.length) this.h.onEvents(events);
    });
    sdk.on('validationStatus', (code, timestampUs, hint) => {
      if (this.destroyed) return;
      this.h.onEvents([{ kind: 'validation', t: clock.toSessionMs(timestampUs), code: validationName(code), hint }]);
    });
    sdk.on('error', (code, message, retryable) => {
      if (this.destroyed) return;
      this.h.onError(ERROR_NAMES[code] ?? `code${code}`, message, retryable);
    });
    sdk.on('processingStatus', (status) => {
      if (status === ProcessingStatus.kRunning) this.h.onRunning();
    });

    sdk.useMediaStream(o.stream);
    await sdk.start();
  }

  /** Stop and destroy; bounded so a stuck SDK never keeps the session alive. */
  async shutdown(): Promise<void> {
    const sdk = this.sdk;
    this.sdk = null;
    this.destroyed = true;
    if (!sdk) return;
    try {
      await Promise.race([sdk.stop(), new Promise((r) => setTimeout(r, 1500))]);
    } catch {
      /* already stopped or in error */
    }
    try {
      sdk.destroy();
    } catch {
      /* idempotent */
    }
  }
}

/** Error code from a thrown SDK error, if it carries one. */
export function sdkErrorName(e: unknown): string | null {
  const code = (e as { code?: unknown })?.code;
  return typeof code === 'number' ? (ERROR_NAMES[code] ?? null) : null;
}
