// Developer tool, skipped unless LEGIBLE_LIVE_REC points at a real numbers-only recording:
//   LEGIBLE_LIVE_REC=path/to/session.json npx vitest run tests/unit/live-recording.test.ts
// Replays it through the Analyzer and prints a 1 s timeline of the features behind every check.

import { describe, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { Analyzer, type AnalyzerOutput } from '../../windows/sensor/analyzer';
import { evT } from '../../windows/sensor/decode';
import type { Recording } from '../../windows/sensor/record';
import { DEFAULT_SETTINGS } from '../../shared/types';

const file = process.env.LEGIBLE_LIVE_REC;

describe.skipIf(!file)('live recording timeline', () => {
  it('prints features per second', () => {
    const rec = JSON.parse(readFileSync(file!, 'utf8')) as Recording;
    const rows: string[] = [];
    let next = 0;
    const settings = { ...DEFAULT_SETTINGS, checks: { ...DEFAULT_SETTINGS.checks } };
    const analyzer = new Analyzer({ mode: 'replay', settings, baseline: rec.baseline, setBaseline: false });
    const events = [...rec.events].sort((x, y) => evT(x) - evT(y));
    let i = 0;
    const onTick = (now: number, out: AnalyzerOutput) => {
        if (now < next) return;
        next = now + 1000;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const a = analyzer as any;
        const b = a.brightness;
        const ratio = b && b.ringLum > 1 ? (b.faceLum / b.ringLum).toFixed(2) : '—';
        const rate = a.syllables.windowRate();
        const issues = Object.entries(out.checks)
          .filter(([, s]) => s === 'issue')
          .map(([k]) => k)
          .join(',');
        rows.push(
          [
            String(Math.round(now / 1000)).padStart(4),
            out.tracking ? 'T' : '-',
            out.speaking ? 'S' : '.',
            a.validation.current.padEnd(20).slice(0, 20),
            (a.yawDeg === null ? '—' : a.yawDeg.toFixed(0)).padStart(4),
            (a.mouthW === null ? '—' : (a.mouthW * 100).toFixed(1)).padStart(5),
            ratio.padStart(5),
            (b ? b.faceLum.toFixed(0) : '—').padStart(4),
            (rate === null ? '—' : rate.toFixed(2)).padStart(5),
            (issues || '').padEnd(16),
            out.nudge?.check ?? '',
          ].join(' '),
        );
    };
    for (let now = 0; now <= rec.durationMs; now += 33) {
      while (i < events.length && evT(events[i]!) <= now) analyzer.push(events[i++]!);
      onTick(now, analyzer.tick(now));
    }
    const talk = rec.events.filter((e) => e.kind === 'talking') as { t: number; detected: boolean }[];
    // speaking runs and gaps from the raw talking flag
    const runs: number[] = [];
    const gaps: number[] = [];
    let cur: boolean | null = null;
    let since = 0;
    for (const e of talk) {
      if (e.detected !== cur) {
        if (cur !== null) (cur ? runs : gaps).push(e.t - since);
        cur = e.detected;
        since = e.t;
      }
    }
    const q = (v: number[], p: number) => [...v].sort((x, y) => x - y)[Math.floor((v.length - 1) * p)] ?? 0;
    console.log(' sec trk spk validation            yaw mouth% ratio face  rate issues           nudge');
    console.log(rows.join('\n'));
    console.log(`talking runs: n=${runs.length} median ${q(runs, 0.5)} ms p90 ${q(runs, 0.9)}; gaps: median ${q(gaps, 0.5)} ms p75 ${q(gaps, 0.75)} p90 ${q(gaps, 0.9)}`);
    console.log('nudges:', analyzer.engine.events.filter((e) => e.type === 'nudge').map((e) => `${e.check}@${(e.t / 1000).toFixed(1)}`).join(' '));
  });
});
