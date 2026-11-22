// Numbers-only recorder. Stores the same compact SensorEvents the analyser consumes —
// a few landmark points, talking flags, validation codes and brightness means. No pixels, no audio.

import type { Baseline, SensorEvent, Settings } from '../../shared/types';

export interface Recording {
  format: 'legible-recording';
  version: 1;
  name: string;
  /** true for generated fixtures, false for real sessions */
  synthetic: boolean;
  createdAt: string;
  durationMs: number;
  baseline: Baseline | null;
  settings?: Partial<Pick<Settings, 'checks' | 'sensitivity'>>;
  events: SensorEvent[];
}

export class Recorder {
  private events: SensorEvent[] = [];
  constructor(private readonly enabled: boolean) {}

  push(e: SensorEvent): void {
    if (this.enabled) this.events.push(e);
  }

  finish(name: string, durationMs: number, baseline: Baseline | null): Recording | null {
    if (!this.enabled || this.events.length === 0) return null;
    return {
      format: 'legible-recording',
      version: 1,
      name,
      synthetic: false,
      createdAt: new Date().toISOString(),
      durationMs,
      baseline,
      events: this.events.map(roundEvent),
    };
  }
}

const r1 = (v: number) => Math.round(v * 10) / 10;
const rp = (p: { x: number; y: number }) => ({ x: r1(p.x), y: r1(p.y) });

/** Round to 0.1 px / 0.1 ms to keep files small; the analyser is insensitive at this scale. */
function roundEvent(e: SensorEvent): SensorEvent {
  if (e.kind !== 'face') return { ...e, t: r1(e.t) } as SensorEvent;
  const s = e.sample;
  return {
    kind: 'face',
    sample: {
      ...s,
      t: r1(s.t),
      nose: rp(s.nose),
      eyeOuterL: rp(s.eyeOuterL),
      eyeOuterR: rp(s.eyeOuterR),
      mouthL: rp(s.mouthL),
      mouthR: rp(s.mouthR),
      lipTop: rp(s.lipTop),
      lipBottom: rp(s.lipBottom),
      box: { x: r1(s.box.x), y: r1(s.box.y), w: r1(s.box.w), h: r1(s.box.h) },
    },
  };
}

export function isRecording(x: unknown): x is Recording {
  return !!x && typeof x === 'object' && (x as Recording).format === 'legible-recording' && Array.isArray((x as Recording).events);
}
