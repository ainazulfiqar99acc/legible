// Preload for the hidden sensor window: the SmartSpectra bridge plus Legible's sensor channel.

import { contextBridge, ipcRenderer } from 'electron';
import type { CH, SensorApi } from '../../shared/ipc';
import type { SensorCommand } from '../../shared/types';

// Exposes window.__smartspectraBridge for @smartspectra/node-sdk/renderer (verified in js/preload/index.js).
require('@smartspectra/node-sdk/preload');

const COMMAND: typeof CH.sensorCommand = 'legible:sensor-command';
const STATE: typeof CH.sensorState = 'legible:sensor-state';
const REPORT: typeof CH.sensorReport = 'legible:sensor-report';
const KEY: typeof CH.sensorKey = 'legible:sensor-key';

const api: SensorApi = {
  onCommand: (cb) => {
    ipcRenderer.on(COMMAND, (_e, c: SensorCommand) => cb(c));
  },
  sendState: (s) => ipcRenderer.send(STATE, s),
  report: (r) => ipcRenderer.send(REPORT, r),
  getKey: () => ipcRenderer.invoke(KEY),
};

contextBridge.exposeInMainWorld('legibleSensor', api);
