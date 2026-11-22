// Window factory. Five kinds: hidden sensor, strip, panel, receipt, setup.

import { BrowserWindow, screen, type Rectangle } from 'electron';
import { join } from 'node:path';
import type { Settings, StripPosition } from '../../shared/types';

const here = import.meta.dirname;
const preload = (name: 'sensor' | 'ui') => join(here, '../preload', `${name}.cjs`);

function load(win: BrowserWindow, page: 'sensor' | 'strip' | 'panel' | 'receipt' | 'setup', query?: Record<string, string>): void {
  const dev = process.env.ELECTRON_RENDERER_URL;
  if (dev) {
    const q = query ? `?${new URLSearchParams(query)}` : '';
    void win.loadURL(`${dev}/windows/${page}/index.html${q}`);
  } else {
    void win.loadFile(join(here, '../renderer/windows', page, 'index.html'), { query });
  }
}

const uiPrefs = {
  preload: preload('ui'),
  contextIsolation: true,
  sandbox: true,
  nodeIntegration: false,
  spellcheck: false,
} as const;

/**
 * Hidden window that owns the camera, the SDK and the analysis.
 * backgroundThrottling: false keeps its timers at ~30 Hz while hidden (verified via LegibleState.tickHz).
 * sandbox: false because the SmartSpectra preload bridge is loaded with require().
 */
export function createSensorWindow(): BrowserWindow {
  const win = new BrowserWindow({
    show: false,
    width: 320,
    height: 240,
    title: 'Legible sensor',
    webPreferences: {
      preload: preload('sensor'),
      contextIsolation: true,
      sandbox: false,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });
  load(win, 'sensor');
  return win;
}

export const STRIP_W = 420;
export const STRIP_H = 72;
const EDGE = 8;

/** Top edge of the display that most likely has the webcam: the primary display (laptop lid / monitor top). */
export function stripBounds(settings: Settings, current?: Rectangle): Rectangle {
  const pos: StripPosition = settings.stripPosition;
  if (pos === 'free' && settings.stripFree) {
    const d = screen.getDisplayNearestPoint(settings.stripFree);
    const wa = d.workArea;
    return {
      x: clamp(settings.stripFree.x, wa.x, wa.x + wa.width - STRIP_W),
      y: clamp(settings.stripFree.y, wa.y, wa.y + wa.height - STRIP_H),
      width: STRIP_W,
      height: STRIP_H,
    };
  }
  const d = current ? screen.getDisplayMatching(current) : screen.getPrimaryDisplay();
  const wa = d.workArea;
  const x =
    pos === 'top-left' ? wa.x + EDGE : pos === 'top-right' ? wa.x + wa.width - STRIP_W - EDGE : Math.round(wa.x + (wa.width - STRIP_W) / 2);
  return { x, y: wa.y + EDGE, width: STRIP_W, height: STRIP_H };
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** After a drag: snap to the top edge when close to it. Returns the snapped bounds. */
export function snapStrip(b: Rectangle): Rectangle {
  const wa = screen.getDisplayMatching(b).workArea;
  const out = { ...b, width: STRIP_W, height: STRIP_H };
  if (b.y - wa.y < 56) out.y = wa.y + EDGE;
  out.x = clamp(out.x, wa.x, wa.x + wa.width - STRIP_W);
  out.y = clamp(out.y, wa.y, wa.y + wa.height - STRIP_H);
  return out;
}

export function createStripWindow(settings: Settings): BrowserWindow {
  const win = new BrowserWindow({
    ...stripBounds(settings),
    frame: false,
    transparent: true,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    show: false,
    title: 'Legible',
    backgroundColor: '#00000000',
    webPreferences: uiPrefs,
  });
  win.setAlwaysOnTop(true, 'floating');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  load(win, 'strip');
  return win;
}

export const PANEL_W = 420;
export const PANEL_H = 520;

export function panelBoundsBelow(strip: Rectangle): Rectangle {
  const wa = screen.getDisplayMatching(strip).workArea;
  let y = strip.y + strip.height + 4;
  if (y + PANEL_H > wa.y + wa.height) y = Math.max(wa.y, strip.y - PANEL_H - 4); // no room below: open above
  return { x: strip.x, y, width: PANEL_W, height: PANEL_H };
}

export function createPanelWindow(strip: Rectangle, tab?: string): BrowserWindow {
  const win = new BrowserWindow({
    ...panelBoundsBelow(strip),
    frame: false,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    title: 'Legible panel',
    backgroundColor: '#FFFFFF',
    webPreferences: uiPrefs,
  });
  win.setAlwaysOnTop(true, 'floating');
  load(win, 'panel', tab ? { tab } : undefined);
  return win;
}

export function createReceiptWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 380,
    height: 720,
    minWidth: 360,
    resizable: true,
    show: false,
    title: 'Legible receipt',
    backgroundColor: '#FFFFFF',
    autoHideMenuBar: true,
    webPreferences: uiPrefs,
  });
  load(win, 'receipt');
  return win;
}

export function createSetupWindow(screenName?: string): BrowserWindow {
  const win = new BrowserWindow({
    width: 640,
    height: 760,
    minWidth: 520,
    minHeight: 560,
    show: false,
    title: 'Legible',
    backgroundColor: '#FFFFFF',
    autoHideMenuBar: true,
    webPreferences: uiPrefs,
  });
  load(win, 'setup', screenName ? { screen: screenName } : undefined);
  return win;
}
