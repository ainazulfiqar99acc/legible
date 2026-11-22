// Summarise the latest live check (test-results/live/live-*.json) and the matching numbers-only recording.
//   node scripts/live-report.mjs [live-file.json]
// Prints per-step: tracking %, speaking %, strip lines, first nudge and its latency, and from the
// recording: head yaw (median, p10–p90), mouth width % and face samples per second.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';

const ROOT = resolve(import.meta.dirname, '..');
const LIVE = join(ROOT, 'test-results', 'live');
const latest = (dir, re) =>
  readdirSync(dir)
    .filter((f) => re.test(f))
    .map((f) => join(dir, f))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];

const file = process.argv[2] ?? latest(LIVE, /^live-.*\.json$/);
const { result, log, probe } = JSON.parse(readFileSync(file, 'utf8'));
const appData = process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming');
const recDir = join(appData, 'legible', 'legible-data', 'recordings');
let rec = null;
try {
  rec = JSON.parse(readFileSync(latest(recDir, /\.json$/), 'utf8'));
} catch {
  /* no recording */
}

const NOSE_DEPTH_RATIO = 0.45;
function yaw(s) {
  const ex = s.eyeOuterR.x - s.eyeOuterL.x;
  const ey = s.eyeOuterR.y - s.eyeOuterL.y;
  const w = Math.hypot(ex, ey);
  if (!(w > 4)) return null;
  const mx = (s.eyeOuterL.x + s.eyeOuterR.x) / 2;
  const my = (s.eyeOuterL.y + s.eyeOuterR.y) / 2;
  const along = ((s.nose.x - mx) * ex + (s.nose.y - my) * ey) / w;
  return (Math.atan(along / w / NOSE_DEPTH_RATIO) * 180) / Math.PI;
}
const q = (v, p) => {
  if (!v.length) return null;
  const s = [...v].sort((a, b) => a - b);
  const i = (s.length - 1) * p;
  return s[Math.floor(i)] + (s[Math.ceil(i)] - s[Math.floor(i)]) * (i - Math.floor(i));
};
const f1 = (v) => (v === null || v === undefined ? '—' : v.toFixed(1));

console.log('file:', file);
console.log('ok:', result.ok, result.error ? `error: ${result.error.split('\n')[0]}` : '');
console.log('baseline:', JSON.stringify(result.baseline ?? null));
console.log('practice receipt:', result.practicePct ?? '—', '| init to tracking:', result.initMs, 'ms | stop→receipt:', result.stopToReceiptMs, 'ms');
console.log('diagnostics:', log.filter((l) => /landmarks|talking stream|readiness|error|sdk running/.test(l)).map((l) => l.replace(/^\[legible\] \S+ /, '')).join(' | '));

const rows = probe.rows;
const liveRows = rows.filter((r) => r.mode === 'live');
const liveStart = liveRows.find((r) => r.phase !== 'off')?.t ?? liveRows[0]?.t;
const marks = result.marks ?? [];
const stepEnd = (i) => (i + 1 < marks.length ? marks[i + 1].t : (rows.at(-1)?.t ?? marks[i].t));

// the live recording: events are session ms since the sensor started
const faces = rec && rec.events ? rec.events.filter((e) => e.kind === 'face').map((e) => e.sample) : [];
const talkEv = rec && rec.events ? rec.events.filter((e) => e.kind === 'talking') : [];
const valEv = rec && rec.events ? rec.events.filter((e) => e.kind === 'validation') : [];
if (rec) console.log(`recording: ${rec.name}, ${faces.length} face samples, ${talkEv.length} talking, ${valEv.length} validation; frame ${faces[0]?.frameW}x${faces[0]?.frameH}`);

console.log('\nstep        | trk% | spk% | yaw med (p10..p90) | mouth% | face/s | first nudge (latency) | lines');
for (const [i, m] of marks.entries()) {
  const a = m.t;
  const b = stepEnd(i);
  const rs = rows.filter((r) => r.t >= a && r.t < b && r.mode === 'live');
  const trk = rs.length ? (100 * rs.filter((r) => r.tracking).length) / rs.length : null;
  const spk = rs.length ? (100 * rs.filter((r) => r.speaking).length) / rs.length : null;
  const firstN = rs.find((r) => r.nudge);
  const lines = [...new Set(rs.map((r) => r.line))].slice(0, 5).join(' / ');
  const sa = a - liveStart;
  const sb = b - liveStart;
  const fs = faces.filter((s) => s.t >= sa && s.t < sb);
  const ys = fs.map(yaw).filter((v) => v !== null);
  const mw = fs.map((s) => (100 * Math.hypot(s.mouthR.x - s.mouthL.x, s.mouthR.y - s.mouthL.y)) / s.frameW);
  console.log(
    `${m.id.padEnd(11)} | ${f1(trk).padStart(4)} | ${f1(spk).padStart(4)} | ${f1(q(ys, 0.5)).padStart(6)} (${f1(q(ys, 0.1))}..${f1(q(ys, 0.9))}) | ${f1(q(mw, 0.5)).padStart(5)} | ${f1(fs.length / ((b - a) / 1000)).padStart(5)} | ${firstN ? `${firstN.nudge} +${((firstN.t - a) / 1000).toFixed(1)}s` : '—'} | ${lines}`,
  );
}

const vals = [...new Set(valEv.map((e) => e.code))];
console.log('\nvalidation codes seen:', vals.join(', ') || '—');

// CPU / memory
const ms = probe.metrics ?? [];
if (ms.length) {
  const byType = {};
  for (const s of ms) {
    const agg = {};
    for (const p of s.procs) {
      const k = p.type === 'Tab' ? 'renderers' : p.type;
      agg[k] ??= { cpu: 0, mem: 0 };
      agg[k].cpu += p.cpu;
      agg[k].mem += p.mem;
    }
    for (const [k, v] of Object.entries(agg)) (byType[k] ??= []).push(v);
  }
  console.log('\nCPU % of one core (mean / max) and working set MB (first → last), per process type:');
  for (const [k, arr] of Object.entries(byType)) {
    const cpu = arr.map((v) => v.cpu);
    console.log(
      `  ${k.padEnd(10)} cpu ${f1(cpu.reduce((x, y) => x + y, 0) / cpu.length)} / ${f1(Math.max(...cpu))}   mem ${f1(arr[0].mem / 1024)} → ${f1(arr.at(-1).mem / 1024)}`,
    );
  }
}
const hz = liveRows.map((r) => r.hz).filter((v) => v > 0);
console.log('sensor loop Hz (median):', q(hz, 0.5));
if (result.receiptText) console.log('\nreceipt:\n' + result.receiptText.split('\n').filter(Boolean).slice(0, 30).join('\n'));
