// Preload for strip, panel, receipt and setup windows. Exposes a narrow API; no Node, no SDK, no key.
// Sandboxed preloads cannot require local chunks, so channel names are inlined (type-checked against shared/ipc).

import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { CH, LegibleApi } from '../../shared/ipc';

const STATE: typeof CH.state = 'legible:state';
const RECEIPT: typeof CH.receipt = 'legible:receipt';
const NAVIGATE: typeof CH.navigate = 'legible:navigate';
const COMMAND: typeof CH.command = 'legible:command';
const INVOKE: typeof CH.invoke = 'legible:invoke';

function sub<T>(channel: string, cb: (v: T) => void): () => void {
  const fn = (_e: IpcRendererEvent, v: T) => cb(v);
  ipcRenderer.on(channel, fn);
  return () => ipcRenderer.removeListener(channel, fn);
}

const api: LegibleApi = {
  onState: (cb) => sub(STATE, cb),
  onReceipt: (cb) => sub(RECEIPT, cb),
  onNavigate: (cb) => sub(NAVIGATE, cb),
  command: (c) => ipcRenderer.send(COMMAND, c),
  invoke: (name, req) => ipcRenderer.invoke(INVOKE, name, req),
  platform: process.platform,
};

contextBridge.exposeInMainWorld('legible', api);
