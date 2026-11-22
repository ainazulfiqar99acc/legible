// Replay: feeds a numbers-only recording through the same Analyzer as a live session.

import type { Settings } from '../../shared/types';
import { DEFAULT_SETTINGS } from '../../shared/types';
import { TICK_MS } from '../../rules/thresholds';
import { Analyzer, type AnalyzerOutput } from './analyzer';
import { evT } from './decode';
import type { Recording } from './record';

export function replaySettings(rec: Recording, base: Settings = DEFAULT_SETTINGS): Settings {
  return {
    ...base,
    checks: { ...base.checks, ...(rec.settings?.checks ?? {}) },
    sensitivity: rec.settings?.sensitivity ?? base.sensitivity,
  };
}

/** Steps through a recording as fast as possible. Used by unit tests and to verify "same nudges on replay". */
export function runReplay(
  rec: Recording,
  opts: { settings?: Settings; tickMs?: number; onTick?: (now: number, out: AnalyzerOutput) => void } = {},
): { analyzer: Analyzer; endMs: number } {
  const settings = opts.settings ?? replaySettings(rec);
  const analyzer = new Analyzer({ mode: 'replay', settings, baseline: rec.baseline, setBaseline: false });
  const events = [...rec.events].sort((a, b) => evT(a) - evT(b));
  const tick = opts.tickMs ?? TICK_MS;
  let i = 0;
  let now = 0;
  for (; now <= rec.durationMs; now += tick) {
    while (i < events.length && evT(events[i]!) <= now) analyzer.push(events[i++]!);
    const out = analyzer.tick(now);
    opts.onTick?.(now, out);
  }
  analyzer.finish(now);
  return { analyzer, endMs: now };
}

/** Real-time player for the sensor window. Calls `push` for each event when its time comes. */
export class ReplayPlayer {
  private i = 0;
  private readonly events;
  constructor(readonly rec: Recording, private readonly speed: number) {
    this.events = [...rec.events].sort((a, b) => evT(a) - evT(b));
  }

  /** Session time for a wall-clock elapsed time. */
  sessionMs(elapsedWallMs: number): number {
    return elapsedWallMs * this.speed;
  }

  drain(untilMs: number, push: (e: Recording['events'][number]) => void): void {
    while (this.i < this.events.length && evT(this.events[this.i]!) <= untilMs) push(this.events[this.i++]!);
  }

  done(sessionMs: number): boolean {
    return sessionMs > this.rec.durationMs;
  }
}
