// Legible's own data, all inside one folder so "Delete everything" can remove it in one go:
//   <userData>/legible-data/settings.json, baseline.json, key.bin, receipts/*.json, recordings/*.json

import { app } from 'electron';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import type { Baseline, Receipt, Settings } from '../../shared/types';
import { DEFAULT_SETTINGS } from '../../shared/types';

export const dataDir = (): string => join(app.getPath('userData'), 'legible-data');
const p = (...parts: string[]) => join(dataDir(), ...parts);

function ensure(dir = dataDir()): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function readJson<T>(file: string): T | null {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as T;
  } catch {
    return null;
  }
}

/** Write via a temp file so a crash never leaves half a JSON file. */
function writeJson(file: string, value: unknown): void {
  ensure(join(file, '..'));
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify(value, null, 2));
  renameSync(tmp, file);
}

export function loadSettings(): Settings {
  const s = readJson<Partial<Settings>>(p('settings.json'));
  return {
    ...DEFAULT_SETTINGS,
    ...(s ?? {}),
    checks: { ...DEFAULT_SETTINGS.checks, ...(s?.checks ?? {}) },
  };
}

export function saveSettings(s: Settings): void {
  writeJson(p('settings.json'), s);
}

export function loadBaseline(): Baseline | null {
  return readJson<Baseline>(p('baseline.json'));
}

export function saveBaseline(b: Baseline): void {
  writeJson(p('baseline.json'), b);
}

const safeId = (id: string) => id.replace(/[^a-zA-Z0-9_-]/g, '');

export function saveReceipt(r: Receipt): void {
  writeJson(p('receipts', `${safeId(r.id)}.json`), r);
}

export function deleteReceipt(id: string): void {
  rmSync(p('receipts', `${safeId(id)}.json`), { force: true });
}

export function listReceipts(): Receipt[] {
  const dir = p('receipts');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => readJson<Receipt>(join(dir, f)))
    .filter((r): r is Receipt => !!r)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

export function saveRecording(name: string, rec: unknown): string {
  const file = p('recordings', `${safeId(name)}.json`);
  writeJson(file, rec);
  return file;
}

export const keyFile = (): string => p('key.bin');

export function writeKeyFile(buf: Buffer): void {
  ensure();
  writeFileSync(keyFile(), buf);
}

export function readKeyFile(): Buffer | null {
  try {
    return readFileSync(keyFile());
  } catch {
    return null;
  }
}

/** Removes Legible's whole data folder. */
export function deleteEverything(): void {
  rmSync(dataDir(), { recursive: true, force: true });
}

export function isDataDirEmpty(): boolean {
  return !existsSync(dataDir()) || readdirSync(dataDir()).length === 0;
}
