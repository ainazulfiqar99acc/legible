// Legible main process: windows, IPC bus, key store, permissions, session lifecycle.

import { app, BrowserWindow, globalShortcut, ipcMain, Menu, session, shell, systemPreferences, type WebContents } from 'electron';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CH, type InvokeMap, type InvokeName } from '../../shared/ipc';
import type { Command, LegibleState, Receipt, SensorCommand, SensorReport, SessionMode, Settings } from '../../shared/types';
import { offState } from '../../shared/state';
import { describeError } from '../../shared/strings';
import * as store from './store';
import * as keys from './keystore';
import { checkReadiness, sdkVersion } from './readiness';
import { createPanelWindow, createReceiptWindow, createSensorWindow, createSetupWindow, createStripWindow, panelBoundsBelow, snapStrip, stripBounds } from './windows';
import { log } from './log';

const nodeRequire = createRequire(import.meta.url);

if (process.env.LEGIBLE_USER_DATA) app.setPath('userData', process.env.LEGIBLE_USER_DATA);
const REPLAY_FLAG = process.argv.includes('--replay');
const REPLAY_SPEED = Math.max(0.25, Number(process.env.LEGIBLE_REPLAY_SPEED ?? '1') || 1);
const REPLAY_NAME = process.env.LEGIBLE_REPLAY_FIXTURE ?? 'demo';

if (!app.requestSingleInstanceLock()) app.quit();

let settings: Settings;
let state: LegibleState = offState();
let sensor: BrowserWindow | null = null;
let sensorMode: SessionMode | null = null;
let strip: BrowserWindow | null = null;
let panel: BrowserWindow | null = null;
let receiptWin: BrowserWindow | null = null;
let setup: BrowserWindow | null = null;
let pendingReceipt: Receipt | null = null;
let stopWaiter: ((r: SensorReport | null) => void) | null = null;
let stopping: Promise<void> | null = null;
let quitting = false;

const alive = (w: BrowserWindow | null): w is BrowserWindow => !!w && !w.isDestroyed();

// ---- state bus -----------------------------------------------------------------------
function broadcast(s: LegibleState): void {
  for (const w of [strip, panel, setup]) if (alive(w)) w.webContents.send(CH.state, s);
}

function setState(patch: Partial<LegibleState>): void {
  state = { ...state, ...patch };
  broadcast(state);
}

// ---- windows -------------------------------------------------------------------------
function showStrip(): BrowserWindow {
  if (!alive(strip)) {
    strip = createStripWindow(settings);
    const w = strip;
    w.once('ready-to-show', () => w.showInactive());
    w.on('moved', () => {
      const b = snapStrip(w.getBounds());
      w.setBounds(b);
      settings = { ...settings, stripPosition: 'free', stripFree: { x: b.x, y: b.y } };
      store.saveSettings(settings);
      if (alive(panel)) panel.setBounds(panelBoundsBelow(b));
    });
    // closing the strip stops sensing
    w.on('close', () => void stopSession());
    w.on('closed', () => (strip = null));
    w.webContents.on('did-finish-load', () => w.webContents.send(CH.state, state));
  } else if (!strip.isVisible()) strip.showInactive();
  return strip;
}

function togglePanel(tab?: string): void {
  if (alive(panel)) {
    if (tab) panel.webContents.send(CH.navigate, tab);
    else {
      panel.close();
      return;
    }
    panel.show();
    return;
  }
  const s = showStrip();
  panel = createPanelWindow(s.getBounds(), tab);
  const p = panel;
  p.once('ready-to-show', () => p.show());
  p.on('closed', () => (panel = null));
  p.webContents.on('did-finish-load', () => p.webContents.send(CH.state, state));
}

function openSetup(screenName?: string): void {
  if (alive(setup)) {
    if (screenName) setup.webContents.send(CH.navigate, screenName);
    setup.show();
    setup.focus();
    return;
  }
  setup = createSetupWindow(screenName);
  const w = setup;
  w.once('ready-to-show', () => w.show());
  w.on('closed', () => {
    setup = null;
    if (sensorMode === 'rehearsal') void stopSession();
  });
  w.webContents.on('did-finish-load', () => w.webContents.send(CH.state, state));
}

function openReceipt(r: Receipt): void {
  pendingReceipt = r;
  if (alive(receiptWin)) {
    receiptWin.webContents.send(CH.receipt, r);
    receiptWin.show();
    return;
  }
  receiptWin = createReceiptWindow();
  const w = receiptWin;
  w.once('ready-to-show', () => w.show());
  w.on('closed', () => {
    receiptWin = null;
    // closing without Keep = discard
    if (pendingReceipt && !pendingReceipt.kept) pendingReceipt = null;
  });
  w.webContents.on('did-finish-load', () => {
    if (pendingReceipt) w.webContents.send(CH.receipt, pendingReceipt);
  });
}

// ---- session lifecycle ---------------------------------------------------------------
function loadRecording(name: string): unknown {
  const file = join(app.getAppPath(), 'fixtures', `${name.replace(/[^a-z0-9-]/gi, '')}.json`);
  return JSON.parse(readFileSync(file, 'utf8'));
}

async function startSession(mode: SessionMode, setBaseline = true): Promise<void> {
  if (stopping) await stopping;
  if (sensor) return;
  if (mode !== 'replay') {
    if (!settings.consentGiven) return openSetup('consent');
    if (!keys.hasKey().hasKey) {
      setState({ ...offState(), phase: 'error', error: describeError('noKey', '', false), line: 'No API key yet' });
      showStrip();
      return openSetup('setup');
    }
    if (process.platform === 'darwin') {
      const ok = await systemPreferences.askForMediaAccess('camera');
      if (!ok) {
        setState({ ...offState(), phase: 'error', error: describeError('NotAllowedError', '', false), line: 'Camera permission denied' });
        showStrip();
        return;
      }
    }
  }
  if (mode === 'rehearsal') openSetup('rehearsal');
  else showStrip();
  setState({ ...offState(), phase: 'starting', mode, line: mode === 'replay' ? 'REPLAY — starting…' : 'Starting…' });

  // The SDK readiness check is not run here: on this SDK it takes ~25 s, opens the camera natively and judges
  // the conditions of that moment (e.g. no one seated yet), so it delayed and sometimes blocked a session that
  // would have worked. It stays available as Setup → "Check this computer"; live problems surface as SDK errors.

  let recording: unknown = null;
  if (mode === 'replay') {
    try {
      recording = loadRecording(REPLAY_NAME);
    } catch (e) {
      setState({ phase: 'error', error: describeError('replay', `Replay file missing: ${String(e)}`, false) });
      return;
    }
  }

  sensorMode = mode;
  sensor = createSensorWindow();
  const s = sensor;
  if (mode !== 'replay') {
    const { bindSmartSpectraIpc } = nodeRequire('@smartspectra/node-sdk/main') as {
      bindSmartSpectraIpc: (w: BrowserWindow, o?: { logger?: (l: string, m: string) => void }) => void;
    };
    // the SDK bridge logs IPC diagnostics; route them through our event-name-only logger
    bindSmartSpectraIpc(s, { logger: (level, msg) => log(`sdk-ipc ${level}: ${msg.slice(0, 120)}`) });
  }
  s.on('closed', () => {
    if (sensor === s) {
      sensor = null;
      sensorMode = null;
    }
  });
  s.webContents.on('render-process-gone', (_e, d) => {
    log(`sensor gone: ${d.reason}`);
    stopWaiter?.(null);
  });
  s.webContents.once('did-finish-load', () => {
    const cmd: SensorCommand = {
      type: 'start',
      mode,
      deviceId: settings.deviceId,
      settings,
      baseline: store.loadBaseline(),
      setBaseline,
      replaySpeed: REPLAY_SPEED,
      recording,
    };
    s.webContents.send(CH.sensorCommand, cmd);
  });
  log(`session start ${mode}`);
}

/** Stop: the sensor stops camera tracks first (camera off within 1 s), then the SDK; then the window is destroyed. */
function stopSession(showReceipt = true): Promise<void> {
  if (stopping) return stopping;
  const s = sensor;
  if (!s) {
    if (state.phase !== 'off') setState(offState());
    hideStrip();
    return Promise.resolve();
  }
  stopping = (async () => {
    const report = await new Promise<SensorReport | null>((resolve) => {
      stopWaiter = resolve;
      if (!s.isDestroyed()) s.webContents.send(CH.sensorCommand, { type: 'stop' } satisfies SensorCommand);
      setTimeout(() => resolve(null), 2500);
    });
    stopWaiter = null;
    finish(s, report, showReceipt);
  })();
  return stopping.finally(() => (stopping = null));
}

function finish(s: BrowserWindow, report: SensorReport | null, showReceipt: boolean): void {
  // read the mode first: destroy() fires the window's 'closed' handler, which clears sensorMode
  const mode = sensorMode;
  if (!s.isDestroyed()) s.destroy(); // releases the SDK binding and any camera handle
  if (sensor === s) sensor = null;
  sensorMode = null;
  log(`session stop ${mode ?? ''}`);
  if (report?.type === 'stopped') {
    if (report.baseline) store.saveBaseline(report.baseline);
    if (report.recording) store.saveRecording(`session-${Date.now()}`, report.recording);
    if (showReceipt && report.receipt && !quitting) openReceipt(report.receipt);
  }
  setState(offState());
  hideStrip();
  if (mode === 'rehearsal' && alive(setup)) setup.webContents.send(CH.navigate, 'rehearsal-done');
}

function hideStrip(): void {
  if (alive(panel)) panel.close();
  if (alive(strip)) {
    strip.removeAllListeners('close');
    strip.close();
  }
}

async function handleCommand(c: Command): Promise<void> {
  switch (c.type) {
    case 'start':
      return startSession(c.mode, c.setBaseline ?? true);
    case 'stop':
      return stopSession();
    case 'retry': {
      const mode = sensorMode ?? state.mode ?? 'live';
      await stopSession(false);
      return startSession(mode);
    }
    case 'rehearsal-next':
    case 'rehearsal-redo':
      if (alive(sensor)) sensor.webContents.send(CH.sensorCommand, { type: c.type } satisfies SensorCommand);
      return;
    case 'open-panel':
      return togglePanel(c.tab);
    case 'close-panel':
      if (alive(panel)) panel.close();
      return;
    case 'open-setup':
      return openSetup(c.screen);
    case 'open-obs-guide':
      return openSetup('obs');
    case 'mirror':
      return;
  }
}

// ---- IPC -----------------------------------------------------------------------------
const ourWindows = () => [strip, panel, receiptWin, setup].filter(alive).map((w) => w.webContents);
const fromUi = (wc: WebContents) => ourWindows().includes(wc);

type Handler<K extends InvokeName> = (req: InvokeMap[K]['req']) => Promise<InvokeMap[K]['res']> | InvokeMap[K]['res'];
const handlers: { [K in InvokeName]: Handler<K> } = {
  getSettings: () => settings,
  setSettings: (patch) => {
    settings = { ...settings, ...patch, checks: { ...settings.checks, ...(patch.checks ?? {}) } };
    store.saveSettings(settings);
    if (alive(sensor)) sensor.webContents.send(CH.sensorCommand, { type: 'settings', settings } satisfies SensorCommand);
    if (patch.stripPosition && patch.stripPosition !== 'free' && alive(strip)) strip.setBounds(stripBounds(settings, strip.getBounds()));
    return settings;
  },
  hasKey: () => keys.hasKey(),
  saveKey: (key) => {
    const r = keys.saveKey(key);
    log(`key saved ${r.ok}`);
    return r;
  },
  clearKey: () => keys.clearKey(),
  getBaseline: () => store.loadBaseline(),
  listReceipts: () => store.listReceipts(),
  currentReceipt: () => pendingReceipt,
  keepReceipt: (id) => {
    if (!pendingReceipt || pendingReceipt.id !== id) return null;
    pendingReceipt = { ...pendingReceipt, kept: true };
    store.saveReceipt(pendingReceipt);
    return pendingReceipt;
  },
  discardReceipt: (id) => {
    store.deleteReceipt(id);
    if (pendingReceipt?.id === id) pendingReceipt = null;
  },
  deleteEverything: async () => {
    await stopSession(false);
    store.deleteEverything();
    await session.defaultSession.clearStorageData();
    settings = store.loadSettings();
    pendingReceipt = null;
    log('deleted everything');
    return { ok: store.isDataDirEmpty(), path: store.dataDir() };
  },
  dataPath: () => store.dataDir(),
  readiness: async ({ deviceLabel }) => {
    if (sensor) return { verdict: 'inconclusive', reason: 'Stop the current session first.' };
    if (!settings.consentGiven) return { verdict: 'inconclusive', reason: 'Agree to the camera consent first.' };
    const key = keys.loadKey();
    if (!key) return { verdict: 'error', reason: 'Add your API key first.' };
    const r = await checkReadiness(key, deviceLabel, settings.checks.phrase);
    log(`readiness ${r.verdict}: ${r.reason.slice(0, 160)}`);
    return r;
  },
  printReceipt: () => {
    if (alive(receiptWin)) receiptWin.webContents.print({ printBackground: true });
  },
  openExternal: async (url) => {
    if (/^https:\/\/[a-z0-9.-]+\.[a-z]{2,}(\/|$)/i.test(url)) await shell.openExternal(url);
  },
  getState: () => state,
  info: () => ({ platform: process.platform, version: app.getVersion(), sdkVersion: sdkVersion(), replayOnly: !keys.hasKey().hasKey }),
};

function registerIpc(): void {
  ipcMain.on(CH.sensorState, (e, s: LegibleState) => {
    if (!sensor || e.sender !== sensor.webContents) return;
    state = s;
    broadcast(s);
  });
  ipcMain.on(CH.sensorReport, (e, r: SensorReport) => {
    if (!sensor || e.sender !== sensor.webContents) return;
    if (r.type === 'log') return log(`sensor ${r.event}`);
    if (stopWaiter) stopWaiter(r);
    else if (!stopping) {
      // the sensor ended on its own (replay finished, rehearsal done)
      const s = sensor;
      stopping = Promise.resolve(finish(s, r, true)).finally(() => (stopping = null));
    }
  });
  // the API key goes only to the sensor window, only to construct the SDK
  ipcMain.handle(CH.sensorKey, (e) => (sensor && e.sender === sensor.webContents && sensorMode !== 'replay' ? keys.loadKey() : null));
  ipcMain.on(CH.command, (e, c: Command) => {
    if (fromUi(e.sender)) void handleCommand(c);
  });
  ipcMain.handle(CH.invoke, (e, name: InvokeName, req: unknown) => {
    if (!fromUi(e.sender)) throw new Error('not allowed');
    const h = handlers[name] as Handler<InvokeName> | undefined;
    if (!h) throw new Error(`unknown call ${String(name)}`);
    return h(req as never);
  });
}

// ---- permissions: camera (video only) after consent; never the microphone -------------
function registerPermissions(): void {
  const ses = session.defaultSession;
  ses.setPermissionRequestHandler((_wc, permission, cb, details) => {
    if (permission === 'media') {
      const types = (details as { mediaTypes?: string[] }).mediaTypes ?? [];
      return cb(settings.consentGiven && types.length > 0 && types.every((t) => t === 'video'));
    }
    cb(false);
  });
  ses.setPermissionCheckHandler((_wc, permission, _origin, details) => {
    if (permission === 'media') return settings.consentGiven && (details as { mediaType?: string }).mediaType !== 'audio';
    return false;
  });
  app.on('web-contents-created', (_e, wc) => {
    wc.setWindowOpenHandler(() => ({ action: 'deny' }));
    wc.on('will-navigate', (ev, url) => {
      const dev = process.env.ELECTRON_RENDERER_URL;
      if (!(dev && url.startsWith(dev)) && !url.startsWith('file://')) ev.preventDefault();
    });
  });
}

// ---- app -----------------------------------------------------------------------------
app.whenReady().then(() => {
  settings = store.loadSettings();
  if (process.platform !== 'darwin') Menu.setApplicationMenu(null);
  registerPermissions();
  registerIpc();
  const ok = globalShortcut.register('CommandOrControl+Shift+L', () => {
    if (sensor) void stopSession();
    else if (settings.consentGiven && keys.hasKey().hasKey) void startSession('live');
    else openSetup(settings.consentGiven ? 'setup' : 'welcome');
  });
  if (!ok) log('shortcut unavailable');
  if (REPLAY_FLAG) void startSession('replay');
  else openSetup('welcome');
});

app.on('second-instance', () => openSetup());
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) openSetup('welcome');
});

app.on('before-quit', (e) => {
  if (sensor && !quitting) {
    e.preventDefault();
    quitting = true;
    void stopSession(false).finally(() => app.quit());
  }
});

app.on('window-all-closed', () => {
  if (!sensor) app.quit();
});

app.on('will-quit', () => globalShortcut.unregisterAll());
