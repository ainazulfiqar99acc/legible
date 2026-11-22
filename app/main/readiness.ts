// Device readiness. In @smartspectra/node-sdk 3.5.0 checkDeviceReadiness() exists only on the main-process
// SmartSpectraSDK (js/index.d.ts), and it needs a camera input, so it runs here, after consent, while no
// session holds the camera. It opens the camera natively for the duration of the check.

import { createRequire } from 'node:module';
import type { ReadinessResult } from '../../shared/ipc';

const nodeRequire = createRequire(import.meta.url);

interface CameraInfo {
  id: string;
  name: string | null;
}
interface MainSdk {
  useCamera(selection: unknown): MainSdk;
  checkDeviceReadiness(): Promise<{ verdict: ReadinessResult['verdict']; reason: string }>;
  destroy(): Promise<void>;
}
interface SdkModule {
  SmartSpectraSDK: { new (o: object): MainSdk; availableCameras(): CameraInfo[]; version: string };
  CameraSelection: { default: unknown; byId(id: string): unknown };
  MetricType: Record<string, number>;
  breathingMetrics: readonly number[];
}

let mod: SdkModule | null = null;
function sdk(): SdkModule {
  mod ??= nodeRequire('@smartspectra/node-sdk') as SdkModule;
  return mod;
}

export function sdkVersion(): string {
  try {
    return (nodeRequire('@smartspectra/node-sdk/package.json') as { version: string }).version;
  } catch {
    return 'unknown';
  }
}

export function requestedMetrics(breathing: boolean): number[] {
  const M = sdk().MetricType;
  const face = [M.FACE_LANDMARKS!, M.TALKING!];
  // the breathing bundle is requested only when the phrase-pause check (F12) is on
  return breathing ? [...face, ...sdk().breathingMetrics] : face;
}

export async function checkReadiness(apiKey: string, deviceLabel: string | null, breathing: boolean): Promise<ReadinessResult> {
  let instance: MainSdk | null = null;
  try {
    const m = sdk();
    instance = new m.SmartSpectraSDK({ apiKey, requestedMetrics: requestedMetrics(breathing), enableTelemetry: false });
    let selection = m.CameraSelection.default;
    if (deviceLabel) {
      try {
        const cam = m.SmartSpectraSDK.availableCameras().find((c) => c.name && labelsMatch(c.name, deviceLabel));
        if (cam) selection = m.CameraSelection.byId(cam.id);
      } catch {
        /* discovery unsupported: default camera */
      }
    }
    instance.useCamera(selection);
    const r = await instance.checkDeviceReadiness();
    // every verdict string is truthy: compare explicitly
    return { verdict: r.verdict, reason: r.reason };
  } catch (e) {
    return { verdict: 'error', reason: e instanceof Error ? e.message : String(e) };
  } finally {
    await instance?.destroy().catch(() => undefined);
  }
}

/** Browser labels often append "(xxxx:yyyy)" USB ids; compare the start. */
function labelsMatch(native: string, browser: string): boolean {
  const a = native.toLowerCase().trim();
  const b = browser.toLowerCase().replace(/\s*\([0-9a-f]{4}:[0-9a-f]{4}\)\s*$/, '').trim();
  return a === b || a.startsWith(b) || b.startsWith(a);
}
