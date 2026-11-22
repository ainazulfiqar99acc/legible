// Regenerates the strip / panel / receipt screenshots in docs/media from the synthetic replays.
//   npm run build && node scripts/screenshots.mjs
// Uses a temporary profile and no camera. Renders at 2x for crisp images.

import { _electron as electron } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const MEDIA = join(ROOT, 'docs', 'media');
const SPEED = 2;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function run(fixture, shots) {
  const userData = mkdtempSync(join(tmpdir(), 'legible-shots-'));
  const env = { ...process.env, LEGIBLE_USER_DATA: userData, LEGIBLE_REPLAY_SPEED: String(SPEED), LEGIBLE_REPLAY_FIXTURE: fixture };
  delete env.SMARTSPECTRA_API_KEY;
  const app = await electron.launch({ args: [ROOT, '--replay', '--force-device-scale-factor=2'], cwd: ROOT, env });
  const win = async (name, timeout = 20_000) => {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      for (const w of app.windows()) if (w.url().includes(`/windows/${name}/`)) return w;
      await sleep(100);
    }
    throw new Error(`no ${name} window`);
  };
  await app.evaluate(({ ipcMain }) => {
    globalThis.__t0 = null;
    ipcMain.on('legible:sensor-state', (_e, s) => {
      if (globalThis.__t0 === null && s.phase === 'running') globalThis.__t0 = Date.now();
    });
  });
  const strip = await win('strip');
  let t0 = null;
  while (t0 === null) {
    t0 = await app.evaluate(() => globalThis.__t0);
    await sleep(50);
  }
  for (const [atS, what, file] of shots) {
    await sleep(Math.max(0, t0 + (atS * 1000) / SPEED - Date.now()));
    if (what === 'strip') await strip.screenshot({ path: join(MEDIA, `${file}.png`) });
    else if (what === 'panel-open') await strip.locator('button.lights').click();
    else if (what === 'panel') await (await win('panel')).screenshot({ path: join(MEDIA, `${file}.png`) });
    else if (what === 'tab') await (await win('panel')).getByRole('tab', { name: file }).click();
    else if (what === 'receipt') {
      const r = await win('receipt', 120_000);
      await r.waitForLoadState('domcontentloaded');
      await sleep(800);
      await r.screenshot({ path: join(MEDIA, `${file}.png`), fullPage: true });
    }
    console.log('shot', fixture, atS, what, file);
  }
  await app.close();
  rmSync(userData, { recursive: true, force: true });
}

await run('demo', [
  [4, 'strip', 'strip-listening'],
  [9, 'strip', 'strip-readable'],
  [18.5, 'strip', 'strip-face'],
  [44, 'strip', 'strip-light'],
  [44.5, 'panel-open'],
  [46, 'panel', 'panel-now'],
  [47, 'tab', 'Timeline'],
  [53, 'panel', 'panel-timeline'],
  [61, 'strip', 'strip-distance'],
  [88.5, 'strip', 'strip-not-tracking'],
  [0, 'receipt', 'receipt'],
]);
await run('long-run', [[27, 'strip', 'strip-pauses']]);
