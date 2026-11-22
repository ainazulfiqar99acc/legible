// IPC channel names and the API surface exposed to windows by the preloads.

import type { Baseline, Command, LegibleState, Receipt, SensorCommand, SensorReport, Settings } from './types';

export const CH = {
  state: 'legible:state', // main -> ui (LegibleState)
  command: 'legible:command', // ui -> main (Command)
  receipt: 'legible:receipt', // main -> receipt window (Receipt)
  navigate: 'legible:navigate', // main -> setup/panel (screen or tab)
  sensorCommand: 'legible:sensor-command', // main -> sensor
  sensorState: 'legible:sensor-state', // sensor -> main
  sensorReport: 'legible:sensor-report', // sensor -> main
  sensorKey: 'legible:sensor-key', // sensor -> main (invoke), only from the sensor window
  invoke: 'legible:invoke', // ui -> main (request/response)
} as const;

export interface ReadinessResult {
  verdict: 'ready' | 'limited' | 'blocked' | 'inconclusive' | 'error';
  reason: string;
}

/** Request/response calls from UI windows. */
export interface InvokeMap {
  getSettings: { req: void; res: Settings };
  setSettings: { req: Partial<Settings>; res: Settings };
  hasKey: { req: void; res: { hasKey: boolean; encrypted: boolean } };
  saveKey: { req: string; res: { ok: boolean; message: string } };
  clearKey: { req: void; res: void };
  getBaseline: { req: void; res: Baseline | null };
  listReceipts: { req: void; res: Receipt[] };
  currentReceipt: { req: void; res: Receipt | null };
  keepReceipt: { req: string; res: Receipt | null };
  discardReceipt: { req: string; res: void };
  deleteEverything: { req: void; res: { ok: boolean; path: string } };
  dataPath: { req: void; res: string };
  readiness: { req: { deviceLabel: string | null }; res: ReadinessResult };
  printReceipt: { req: void; res: void };
  openExternal: { req: string; res: void };
  getState: { req: void; res: LegibleState };
  info: { req: void; res: { platform: string; version: string; sdkVersion: string; replayOnly: boolean } };
}
export type InvokeName = keyof InvokeMap;

export interface LegibleApi {
  onState(cb: (s: LegibleState) => void): () => void;
  onReceipt(cb: (r: Receipt) => void): () => void;
  onNavigate(cb: (to: string) => void): () => void;
  command(c: Command): void;
  invoke<K extends InvokeName>(name: K, req?: InvokeMap[K]['req']): Promise<InvokeMap[K]['res']>;
  platform: string;
}

export interface SensorApi {
  onCommand(cb: (c: SensorCommand) => void): void;
  sendState(s: LegibleState): void;
  report(r: SensorReport): void;
  getKey(): Promise<string | null>;
}
