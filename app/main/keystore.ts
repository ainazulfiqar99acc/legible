// API key storage with Electron safeStorage (DPAPI on Windows, Keychain on macOS, libsecret on Linux).
// The key never reaches UI windows, logs or the repo. Only the sensor window can fetch it, to construct the SDK.

import { safeStorage } from 'electron';
import { readKeyFile, writeKeyFile, keyFile } from './store';
import { rmSync } from 'node:fs';

export function saveKey(key: string): { ok: boolean; message: string } {
  const trimmed = key.trim();
  if (trimmed.length < 8) return { ok: false, message: 'That does not look like a SmartSpectra API key.' };
  if (!safeStorage.isEncryptionAvailable()) {
    return { ok: false, message: 'This computer cannot encrypt the key (no OS keychain). The key was not saved.' };
  }
  writeKeyFile(safeStorage.encryptString(trimmed));
  return { ok: true, message: 'Key saved, encrypted by your operating system.' };
}

export function loadKey(): string | null {
  const buf = readKeyFile();
  if (buf && safeStorage.isEncryptionAvailable()) {
    try {
      return safeStorage.decryptString(buf);
    } catch {
      return null;
    }
  }
  // developer fallback, never written to disk by Legible
  return process.env.SMARTSPECTRA_API_KEY || null;
}

export function hasKey(): { hasKey: boolean; encrypted: boolean } {
  const stored = !!readKeyFile();
  return { hasKey: stored || !!process.env.SMARTSPECTRA_API_KEY, encrypted: stored };
}

export function clearKey(): void {
  rmSync(keyFile(), { force: true });
}
