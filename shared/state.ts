import type { LegibleState, SessionTotals } from './types';
import { LINE } from './strings';

export const emptyTotals = (): SessionTotals => ({
  elapsedMs: 0,
  talkMs: 0,
  trackedTalkMs: 0,
  readableMs: 0,
  issueMs: { facing: 0, light: 0, distance: 0, pace: 0, occlusion: 0, phrase: 0 },
  nudges: { facing: 0, light: 0, distance: 0, pace: 0, occlusion: 0, phrase: 0 },
});

export const offState = (): LegibleState => ({
  phase: 'off',
  mode: null,
  camOn: false,
  tracking: false,
  trackingNote: '',
  speaking: false,
  lights: { facing: 'untracked', light: 'untracked', distance: 'untracked', phrase: 'untracked' },
  checks: { facing: 'unknown', light: 'unknown', distance: 'unknown', pace: 'unknown', occlusion: 'unknown', phrase: 'unknown' },
  nudge: null,
  line: LINE.off,
  hint: '',
  error: null,
  totals: emptyTotals(),
  timeline: { facing: [], light: [], distance: [], phrase: [] },
  mouth: null,
  rehearsal: null,
  tickHz: 0,
  replayName: null,
});
