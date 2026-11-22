// Multi-window flow in replay mode: no key, no camera. Drives the real sensor window, IPC bus, strip, panel and receipt.

import { expect, test } from '@playwright/test';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { launch, windowNamed, ROOT } from './app';

const shots = join(ROOT, 'test-results', 'screens');

test('replay: strip reacts, panel opens, receipt shows, Delete everything empties the data folder', async () => {
  const { app, userData } = await launch({ speed: 4 });
  const setup = await windowNamed(app, 'setup');
  await setup.waitForLoadState('domcontentloaded');
  await expect(setup.getByRole('heading', { name: 'Stay lip-readable on calls.' })).toBeVisible();
  await setup.screenshot({ path: join(shots, 'setup-welcome.png') });

  // keyboard: focus "Watch a replay" and press Enter
  await setup.getByRole('button', { name: 'Watch a replay' }).focus();
  await setup.keyboard.press('Enter');

  const strip = await windowNamed(app, 'strip');
  await strip.waitForLoadState('domcontentloaded');
  await expect(strip.locator('.tag', { hasText: 'REPLAY' })).toBeVisible();
  await expect(strip.locator('.line')).toHaveText('Listening', { timeout: 10_000 });
  await strip.screenshot({ path: join(shots, 'strip-listening.png') });
  await expect(strip.locator('.line')).toHaveText('Readable', { timeout: 10_000 });
  await strip.screenshot({ path: join(shots, 'strip-readable.png') });
  await expect(strip.locator('.line')).toHaveText('Face the camera while you talk', { timeout: 15_000 });
  await expect(strip.locator('.light.issue')).toHaveCount(1);
  await strip.screenshot({ path: join(shots, 'strip-issue-face.png') });

  // open the panel by clicking the lights
  await strip.locator('button.lights').click();
  const panel = await windowNamed(app, 'panel');
  await panel.waitForLoadState('domcontentloaded');
  await expect(panel.getByRole('tab', { name: 'Now' })).toBeVisible();
  await panel.screenshot({ path: join(shots, 'panel-now.png') });

  await expect(strip.locator('.line')).toHaveText('Light is behind you', { timeout: 20_000 });
  await strip.screenshot({ path: join(shots, 'strip-issue-light.png') });
  // arrow keys move between tabs
  await panel.getByRole('tab', { name: 'Now' }).focus();
  await panel.keyboard.press('ArrowRight');
  await expect(panel.getByRole('tab', { name: 'Timeline' })).toHaveAttribute('aria-selected', 'true');
  await panel.screenshot({ path: join(shots, 'panel-timeline.png') });

  await expect(strip.locator('.line .sub')).toHaveText('more than one face', { timeout: 40_000 });
  await expect(strip.locator('.line')).toContainText('Not tracking');
  await expect(strip.locator('.light.untracked')).toHaveCount(4);
  await strip.screenshot({ path: join(shots, 'strip-not-tracking.png') });

  await panel.getByRole('tab', { name: 'Settings' }).click();
  await panel.screenshot({ path: join(shots, 'panel-settings.png') });

  // replay ends on its own -> receipt opens
  const receipt = await windowNamed(app, 'receipt', 40_000);
  await receipt.waitForLoadState('domcontentloaded');
  await expect(receipt.getByRole('heading', { name: 'Readability receipt' })).toBeVisible();
  await expect(receipt.locator('.pct')).toHaveText(/^\d+%$/);
  await receipt.screenshot({ path: join(shots, 'receipt.png'), fullPage: true });

  // Keep, then Delete everything from Privacy
  await receipt.getByRole('button', { name: 'Keep' }).click();
  await expect(receipt.getByRole('button', { name: 'Kept' })).toBeVisible();
  const dataDir = join(userData, 'legible-data');
  expect(readdirSync(join(dataDir, 'receipts')).length).toBe(1);

  await setup.getByRole('button', { name: 'Privacy' }).first().click();
  await setup.getByRole('button', { name: 'Delete everything' }).click();
  await setup.getByRole('button', { name: 'Yes, delete everything' }).click();
  await expect(setup.getByText('Everything deleted. The data folder is empty.')).toBeVisible();
  await setup.screenshot({ path: join(shots, 'setup-privacy.png'), fullPage: true });
  expect(existsSync(dataDir) ? readdirSync(dataDir).length : 0).toBe(0);

  await app.close();
});

test('stop: Stop ends a replay, opens the receipt and destroys the sensor window', async () => {
  const { app } = await launch({ replay: true, speed: 2 });
  const strip = await windowNamed(app, 'strip');
  await expect(strip.locator('.line')).toHaveText('Readable', { timeout: 15_000 });
  expect(app.windows().some((w) => w.url().includes('/windows/sensor/'))).toBe(true);
  await strip.getByRole('button', { name: /Stop/ }).click();
  const receipt = await windowNamed(app, 'receipt', 10_000);
  await expect(receipt.getByRole('heading', { name: 'Readability receipt' })).toBeVisible();
  await expect.poll(() => app.windows().some((w) => w.url().includes('/windows/sensor/')), { timeout: 5000 }).toBe(false);
  await app.close();
});

test('hidden sensor window keeps ~30 Hz', async () => {
  const { app } = await launch({ replay: true, speed: 1 });
  const strip = await windowNamed(app, 'strip');
  await strip.locator('button.lights').click();
  const panel = await windowNamed(app, 'panel');
  await expect(panel.locator('.session')).toContainText('Hz', { timeout: 10_000 });
  await panel.waitForTimeout(3000);
  const hz = Number((await panel.locator('.session span[title]').innerText()).replace(/\D+/g, ''));
  expect(hz).toBeGreaterThanOrEqual(25);
  await app.close();
});

test('consent gate: Use in a call without consent shows the consent screen first', async () => {
  const { app } = await launch();
  const setup = await windowNamed(app, 'setup');
  await setup.getByRole('button', { name: 'Use in a call' }).click();
  await expect(setup.getByRole('heading', { name: 'Before the camera turns on' })).toBeVisible();
  await setup.screenshot({ path: join(shots, 'setup-consent.png'), fullPage: true });
  await setup.getByRole('button', { name: 'I agree — allow the camera' }).click();
  await expect(setup.getByRole('heading', { name: 'Setup' })).toBeVisible();
  await setup.screenshot({ path: join(shots, 'setup-setup.png'), fullPage: true });
  await app.close();
});
