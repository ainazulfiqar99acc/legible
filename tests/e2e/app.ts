import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

export const ROOT = resolve(import.meta.dirname, '../..');

export async function launch(opts: { replay?: boolean; speed?: number; fixture?: string; userData?: string } = {}) {
  const userData = opts.userData ?? mkdtempSync(join(tmpdir(), 'legible-e2e-'));
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined) env[k] = v;
  delete env.SMARTSPECTRA_API_KEY;
  const app = await electron.launch({
    args: [ROOT, ...(opts.replay ? ['--replay'] : [])],
    cwd: ROOT,
    env: {
      ...env,
      LEGIBLE_USER_DATA: userData,
      LEGIBLE_REPLAY_SPEED: String(opts.speed ?? 4),
      LEGIBLE_REPLAY_FIXTURE: opts.fixture ?? 'demo',
    },
  });
  return { app, userData };
}

/** Wait for a window whose URL contains `/windows/<name>/`. */
export async function windowNamed(app: ElectronApplication, name: string, timeout = 20_000): Promise<Page> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    for (const w of app.windows()) if (w.url().includes(`/windows/${name}/`)) return w;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`window ${name} did not open`);
}
