// Guided real-camera check (Stage 1). Needs a stored API key and a person in front of the camera.
//
//   npm run build && node scripts/live-check.mjs
//
// It drives the real app (your normal Legible data folder, so the stored key is used): consent, camera choice,
// a rehearsal, then a scripted live session. A small always-on-top window tells the person what to do and when.
// It logs only what the strip shows (lights, line, nudge, mouth width %) plus process CPU/memory, with step labels,
// to test-results/live/. Numbers recording is switched on for this run so the landmarks can be re-analysed offline.
// No pixels, no audio.

import { _electron as electron } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const OUT = join(ROOT, 'test-results', 'live');
mkdirSync(OUT, { recursive: true });
const SKIP_REHEARSAL = process.argv.includes('--no-rehearsal');

const STEPS = [
  { id: 'ready', s: 10, say: 'Face the camera. Stay quiet.', expect: 'Listening' },
  { id: 'talk', s: 15, say: 'Keep facing the camera and talk normally — count out loud or describe your day.', expect: 'Readable' },
  { id: 'yaw15', s: 10, say: 'Keep talking. Turn your head a little to one side (about 15°).', expect: 'probably no nudge (limit is 20°)' },
  { id: 'yaw30', s: 12, say: 'Keep talking. Turn further, about 30°, as if reading a second screen.', expect: 'Face nudge' },
  { id: 'back', s: 10, say: 'Face the camera again. Keep talking.', expect: 'Face clears after 2 s' },
  { id: 'silentturn', s: 12, say: 'STOP talking. Stay silent and turn away (30° or more).', expect: 'no nudge, Listening' },
  { id: 'quiet', s: 6, say: 'Face the camera. Stay quiet.', expect: 'Listening' },
  { id: 'cover', s: 10, say: 'Cover the camera lens with your hand.', expect: 'Not tracking' },
  { id: 'uncover', s: 8, say: 'Uncover the camera. Face it and talk.', expect: 'Readable' },
  { id: 'far', s: 15, say: 'Keep talking and lean back — get as far from the camera as you can.', expect: 'Distance nudge (maybe)' },
  { id: 'normal', s: 10, say: 'Back to your normal distance. Keep talking.', expect: 'Readable' },
  { id: 'fast', s: 18, say: 'Talk FAST — rattle through numbers as quickly as you can.', expect: 'Pace nudge' },
  { id: 'slow', s: 12, say: 'Now talk slowly and clearly.', expect: 'Pace clears' },
  { id: 'dark', s: 15, say: 'If you can: turn off the room light, or tilt so a window is behind you. Keep talking. (If not, just keep talking.)', expect: 'Light nudge (if changed)' },
  { id: 'end', s: 6, say: 'Light back on. Face the camera, stay quiet. Finishing…', expect: '' },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const logLines = [];
const env = { ...process.env };
delete env.LEGIBLE_USER_DATA;
delete env.SMARTSPECTRA_API_KEY;

const app = await electron.launch({ args: [ROOT], cwd: ROOT, env });
app.process().stdout.on('data', (d) => {
  for (const l of String(d).split(/\r?\n/)) if (l.trim()) logLines.push(l), console.log(l);
});

// tap the state stream in main (the same objects the strip receives)
await app.evaluate(({ ipcMain }) => {
  globalThis.__probe = { step: 'setup', rows: [], metrics: [] };
  ipcMain.on('legible:sensor-state', (_e, s) => {
    globalThis.__probe.rows.push({
      t: Date.now(),
      step: globalThis.__probe.step,
      phase: s.phase,
      mode: s.mode,
      cam: s.camOn,
      tracking: s.tracking,
      note: s.trackingNote,
      speaking: s.speaking,
      line: s.line,
      lights: s.lights,
      nudge: s.nudge ? s.nudge.check : null,
      hint: s.hint,
      err: s.error ? `${s.error.title}: ${s.error.detail}` : null,
      w: s.mouth ? s.mouth.widthPct : null,
      hz: s.tickHz,
      talkS: Math.round(s.totals.talkMs / 100) / 10,
    });
  });
});

const setStep = (id) => app.evaluate((_e, id) => (globalThis.__probe.step = id), id);

// prompt window
await app.evaluate(({ BrowserWindow, screen }) => {
  const wa = screen.getPrimaryDisplay().workArea;
  const w = new BrowserWindow({
    width: 560,
    height: 260,
    x: Math.round(wa.x + wa.width / 2 - 280),
    y: Math.round(wa.y + wa.height - 300),
    alwaysOnTop: true,
    closable: false, // the run ends itself; closing this mid-run would strand the script
    minimizable: false,
    title: 'Legible live check — follow these instructions',
    autoHideMenuBar: true,
    webPreferences: { sandbox: true, contextIsolation: true },
  });
  const html = `<!doctype html><meta charset="utf-8"><title>Legible live check</title>
  <style>body{margin:0;font:20px/1.35 system-ui,sans-serif;background:#111;color:#fff;padding:18px}
  #n{font:14px monospace;color:#ffd84d}#say{font-size:26px;font-weight:600;margin:8px 0}#c{font:48px monospace;color:#ffd84d;float:right}#e{font-size:14px;color:#aaa}button{font:600 20px system-ui;padding:10px 22px;margin-top:10px;background:#ffd84d;border:0;cursor:pointer}</style>
  <div id="c"></div><div id="n">Legible live check</div><div id="say">Starting…</div><div id="e"></div><button id="go" hidden onclick="window.ready=true;this.hidden=true">I'm ready — start</button>
  <script>window.ready=false;window.ask=()=>{window.ready=false;document.getElementById('go').hidden=false};window.set=(n,say,e,c)=>{document.getElementById('n').textContent=n;document.getElementById('say').textContent=say;document.getElementById('e').textContent=e;document.getElementById('c').textContent=c}</script>`;
  void w.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  globalThis.__prompt = w;
});
const prompt = (n, say, e = '', c = '') =>
  app.evaluate((_x, a) => globalThis.__prompt && !globalThis.__prompt.isDestroyed() && globalThis.__prompt.webContents.executeJavaScript(`set(${a})`), JSON.stringify([n, say, e, c]).slice(1, -1));

/** Show the "I'm ready" button and wait until the person presses it. */
async function waitReady(n, say) {
  await prompt(n, say, 'Press the button when you are seated in front of the HP camera.');
  await app.evaluate(() => globalThis.__prompt.webContents.executeJavaScript('ask()'));
  for (;;) {
    const ok = await app.evaluate(() => globalThis.__prompt.webContents.executeJavaScript('window.ready'));
    if (ok) return;
    await sleep(300);
  }
}

async function windowNamed(name, timeout = 30_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    for (const w of app.windows()) if (w.url().includes(`/windows/${name}/`)) return w;
    await sleep(100);
  }
  throw new Error(`window ${name} did not open`);
}

async function sampleMetrics() {
  const m = await app.evaluate(({ app }) =>
    app.getAppMetrics().map((p) => ({ type: p.type, name: p.name ?? '', cpu: p.cpu.percentCPUUsage, mem: p.memory.workingSetSize })),
  );
  await app.evaluate((_e, m) => globalThis.__probe.metrics.push({ t: Date.now(), step: globalThis.__probe.step, procs: m }), m);
}

let result = { ok: false };
try {
  const setup = await windowNamed('setup');
  await setup.waitForLoadState('domcontentloaded');
  await setup.evaluate(() => window.legible.invoke('setSettings', { recordNumbers: true }));
  await prompt('Setup', 'Sit facing the HP camera. Legible is setting up…');

  await setup.getByRole('button', { name: 'Rehearse', exact: true }).click();
  const agree = setup.getByRole('button', { name: 'I agree — allow the camera' });
  if (await agree.isVisible({ timeout: 3000 }).catch(() => false)) await agree.click();

  // setup screen (first run) → wait for the camera to be chosen
  const rehearseNow = setup.getByRole('button', { name: 'Rehearse now' });
  if (await rehearseNow.isVisible({ timeout: 5000 }).catch(() => false)) {
    await setup.waitForFunction(() => {
      const s = document.querySelector('#cam');
      return !!s && s.value && /wide vision/i.test(s.selectedOptions[0]?.textContent ?? '');
    }, null, { timeout: 15_000 });
    const label = await setup.evaluate(() => document.querySelector('#cam').selectedOptions[0].textContent);
    console.log('camera:', label);
    await rehearseNow.click();
  }
  const settings = await setup.evaluate(() => window.legible.invoke('getSettings'));
  console.log('device:', settings.deviceLabel);
  if (!/wide vision/i.test(settings.deviceLabel ?? '')) throw new Error(`wrong camera selected: ${settings.deviceLabel}`);

  if (!SKIP_REHEARSAL) {
    await waitReady('Rehearsal', 'Next: read 8 short sentences out loud.');
    await setStep('rehearsal');
    await setup.getByRole('button', { name: 'Start rehearsal' }).click();
    await prompt('Rehearsal', 'Read each sentence in the Legible window out loud, facing the camera. Press Next (or →) after each one.', '8 sentences');
    await setup.getByRole('heading', { name: 'Rehearsal done' }).waitFor({ timeout: 300_000 });
    const base = await setup.evaluate(() => window.legible.invoke('getBaseline'));
    console.log('baseline:', JSON.stringify(base));
    result.baseline = base;
    const prac = await windowNamed('receipt', 10_000).catch(() => null);
    if (prac) result.practicePct = await prac.locator('.pct').innerText().catch(() => null);
  }

  // live session
  await waitReady('Live session', 'Next: about 3 minutes of short instructions in this window.');
  await setStep('starting');
  await prompt('Live session', 'Starting the live session… face the camera, stay quiet.');
  await setup.evaluate(() => window.legible.command({ type: 'start', mode: 'live' }));
  const strip = await windowNamed('strip');
  // wait until tracking (or error)
  const t0 = Date.now();
  for (;;) {
    const st = await app.evaluate(() => globalThis.__probe.rows.at(-1) ?? null);
    if (st?.err) throw new Error(`session error: ${st.err}`);
    if (st?.tracking) break;
    if (Date.now() - t0 > 60_000) throw new Error('no tracking after 60 s');
    await sleep(250);
  }
  result.initMs = Date.now() - t0;
  console.log('tracking after', result.initMs, 'ms');

  const marks = [];
  for (const [i, st] of STEPS.entries()) {
    await setStep(st.id);
    marks.push({ id: st.id, t: Date.now(), expect: st.expect });
    const end = Date.now() + st.s * 1000;
    let lastMetric = 0;
    while (Date.now() < end) {
      const left = Math.ceil((end - Date.now()) / 1000);
      await prompt(`Step ${i + 1}/${STEPS.length} · ${st.id}`, st.say, `Expected on the strip: ${st.expect || '—'}`, String(left));
      if (Date.now() - lastMetric > 4000) {
        lastMetric = Date.now();
        await sampleMetrics();
      }
      await sleep(500);
    }
  }
  result.marks = marks;

  await setStep('stop');
  await prompt('Done', 'Stopping. Thank you!');
  const tStop = Date.now();
  await strip.getByRole('button', { name: /Stop/ }).click();
  const receipt = await windowNamed('receipt', 15_000);
  result.stopToReceiptMs = Date.now() - tStop;
  await receipt.waitForLoadState('domcontentloaded');
  await sleep(800);
  result.receiptText = await receipt.locator('body').innerText();
  await receipt.screenshot({ path: join(OUT, 'receipt.png'), fullPage: true }).catch(() => undefined);
  result.ok = true;
} catch (e) {
  result.error = String(e?.stack ?? e);
  console.error(e);
  await prompt('Stopped', 'The check stopped early. You can close this window.', String(e).slice(0, 160)).catch(() => undefined);
} finally {
  const probe = await app.evaluate(() => globalThis.__probe).catch(() => null);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  writeFileSync(join(OUT, `live-${stamp}.json`), JSON.stringify({ result, log: logLines, probe }, null, 1));
  console.log('saved', join(OUT, `live-${stamp}.json`));
  await sleep(1500);
  await app.evaluate(() => globalThis.__prompt && !globalThis.__prompt.isDestroyed() && globalThis.__prompt.destroy()).catch(() => undefined);
  await app.close().catch(() => undefined);
}
