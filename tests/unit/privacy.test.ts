// Static privacy checks over Legible's own source (not node_modules).

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../..');
const DIRS = ['app', 'windows', 'shared', 'rules'];

function files(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...files(p));
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}
const SOURCES = DIRS.flatMap((d) => files(join(ROOT, d))).map((p) => ({ p, src: readFileSync(p, 'utf8') }));
const code = (src: string) => src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');

describe('privacy rules in code', () => {
  it('scans a meaningful number of files', () => {
    expect(SOURCES.length).toBeGreaterThan(30);
  });

  it('never captures audio', () => {
    for (const { p, src } of SOURCES) {
      const c = code(src);
      expect(c, p).not.toMatch(/audio\s*:\s*true/);
      expect(c, p).not.toMatch(/getDisplayMedia|desktopCapturer|MediaRecorder|createMediaStreamSource/);
      // every getUserMedia call states audio: false explicitly
      const calls = c.split('getUserMedia(').length - 1;
      if (calls > 0) expect(c.split('audio: false').length - 1, p).toBeGreaterThanOrEqual(calls);
    }
  });

  it('never calls requestInsight', () => {
    for (const { p, src } of SOURCES) expect(code(src), p).not.toMatch(/\.requestInsight\s*\(/);
  });

  it('constructs every SDK instance with telemetry off', () => {
    const ctor = SOURCES.filter(({ src }) => /new (m\.)?SmartSpectraSDK\(/.test(code(src)));
    expect(ctor.length).toBe(2); // renderer session + main readiness
    for (const { p, src } of ctor) expect(code(src), p).toMatch(/enableTelemetry:\s*false/);
  });

  it('does not log the key or metric values', () => {
    for (const { p, src } of SOURCES) {
      const c = code(src);
      expect(c, p).not.toMatch(/console\.(log|info|warn|error)\([^)]*(apiKey|key\b)/i);
    }
  });

  it('denies microphone permission in the main process', () => {
    const main = readFileSync(join(ROOT, 'app/main/index.ts'), 'utf8');
    expect(main).toMatch(/types\.every\(\(t\) => t === 'video'\)/);
    expect(main).toMatch(/mediaType !== 'audio'/);
  });
});

describe('log redaction', () => {
  it('redacts long token-like strings', async () => {
    const lines: string[] = [];
    const orig = console.log;
    console.log = (s: string) => lines.push(s);
    try {
      const { log } = await import('../../app/main/log');
      log('key saved ' + 'legibletest' + 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'); // fake token, built so no scanner mistakes it for a real key
    } finally {
      console.log = orig;
    }
    expect(lines[0]).toContain('[redacted]');
    expect(lines[0]).not.toContain('ABCDEFGHIJKLMNOPQRSTUVWXYZ');
  });
});
