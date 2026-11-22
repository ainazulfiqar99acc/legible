import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Recording } from '../../windows/sensor/record';
import { runReplay } from '../../windows/sensor/replay';
import type { AnalyzerOutput } from '../../windows/sensor/analyzer';

export function loadFixture(name: string): Recording {
  return JSON.parse(readFileSync(resolve(import.meta.dirname, '../../fixtures', `${name}.json`), 'utf8')) as Recording;
}

export function replay(name: string) {
  const rec = loadFixture(name);
  const frames: { now: number; out: AnalyzerOutput }[] = [];
  const { analyzer, endMs } = runReplay(rec, { onTick: (now, out) => frames.push({ now, out }) });
  const nudges = analyzer.log.filter((e) => e.type === 'nudge') as { t: number; check: string; message: string }[];
  const clears = analyzer.log.filter((e) => e.type === 'clear') as { t: number; check: string; lastedMs: number }[];
  return { rec, analyzer, frames, nudges, clears, endMs, totals: analyzer.receipt.totals };
}
