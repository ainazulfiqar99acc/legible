// Session accounting. Numbers only, in memory; saved only if the user presses Keep.
//
// readable % = tracked talk time with no active issue / tracked talk time.
// "Active issue" = any enabled check currently in the issue state (held long enough), whether or not
// the engine showed it as the nudge, so rate limiting never makes a session look better than it was.

import type { CheckId, Receipt, SessionTotals, StripCheckId, TimelineCell } from '../../shared/types';
import { CHECK_PRIORITY, STRIP_CHECKS } from '../../shared/types';
import { TIP } from '../../shared/strings';
import { TIMELINE_CELL_MS, TIMELINE_CELLS } from '../../rules/thresholds';
import type { CheckResults } from './checks/evaluate';

const zero = (): Record<CheckId, number> => ({ facing: 0, light: 0, distance: 0, pace: 0, occlusion: 0, phrase: 0 });

const RANK: Record<TimelineCell, number> = { none: 0, listening: 1, untracked: 2, good: 3, issue: 4 };

export interface TickInput {
  now: number;
  speaking: boolean;
  tracked: boolean;
  results: CheckResults;
  /** check that became the active nudge this tick, if any */
  newNudge: CheckId | null;
}

export class ReceiptLog {
  totals: SessionTotals = { elapsedMs: 0, talkMs: 0, trackedTalkMs: 0, readableMs: 0, issueMs: zero(), nudges: zero() };
  private prev: TickInput | null = null;
  private cells: Record<StripCheckId, TimelineCell[]> = { facing: [], light: [], distance: [], phrase: [] };
  private cellIndex = -1;

  /** Account for the interval since the previous tick using the previous tick's state. */
  tick(input: TickInput): void {
    const p = this.prev;
    if (p) {
      const dt = Math.max(0, input.now - p.now);
      this.totals.elapsedMs += dt;
      if (p.speaking) {
        this.totals.talkMs += dt;
        if (p.tracked) {
          this.totals.trackedTalkMs += dt;
          let anyIssue = false;
          for (const id of CHECK_PRIORITY) {
            if (p.results[id].status === 'issue') {
              anyIssue = true;
              this.totals.issueMs[id] += dt;
            }
          }
          if (!anyIssue) this.totals.readableMs += dt;
        }
      }
    }
    if (input.newNudge) this.totals.nudges[input.newNudge]++;
    this.timeline(input);
    this.prev = input;
  }

  private timeline(input: TickInput): void {
    const idx = Math.floor(input.now / TIMELINE_CELL_MS);
    if (idx !== this.cellIndex) {
      // fill skipped cells (e.g. a long replay jump)
      const steps = this.cellIndex < 0 ? 1 : Math.min(idx - this.cellIndex, TIMELINE_CELLS);
      for (let s = 0; s < steps; s++) {
        for (const id of STRIP_CHECKS) {
          this.cells[id].push('none');
          if (this.cells[id].length > TIMELINE_CELLS) this.cells[id].shift();
        }
      }
      this.cellIndex = idx;
    }
    for (const id of STRIP_CHECKS) {
      const st = input.results[id].status;
      const cell: TimelineCell = !input.tracked
        ? 'untracked'
        : !input.speaking
          ? 'listening'
          : st === 'issue'
            ? 'issue'
            : st === 'ok'
              ? 'good'
              : 'listening';
      const arr = this.cells[id];
      const last = arr.length - 1;
      if (RANK[cell] > RANK[arr[last]!]) arr[last] = cell;
    }
  }

  timelineSnapshot(): Record<StripCheckId, TimelineCell[]> {
    return {
      facing: [...this.cells.facing],
      light: [...this.cells.light],
      distance: [...this.cells.distance],
      phrase: [...this.cells.phrase],
    };
  }

  build(kind: Receipt['kind'], startedAt: Date, endedAt: Date): Receipt {
    const t = this.totals;
    const issues = CHECK_PRIORITY.map((check) => ({
      check,
      seconds: round1(t.issueMs[check] / 1000),
      nudges: t.nudges[check],
    })).filter((l) => l.seconds > 0 || l.nudges > 0);
    // top issue = most issue time; ties broken by priority order
    let top: CheckId | null = null;
    for (const id of CHECK_PRIORITY) if (t.issueMs[id] > 0 && (top === null || t.issueMs[id] > t.issueMs[top])) top = id;
    return {
      version: 1,
      id: `${startedAt.toISOString().replace(/[:.]/g, '-')}-${kind}`,
      kind,
      startedAt: startedAt.toISOString(),
      endedAt: endedAt.toISOString(),
      durationS: round1(t.elapsedMs / 1000),
      talkS: round1(t.talkMs / 1000),
      trackedTalkS: round1(t.trackedTalkMs / 1000),
      readableS: round1(t.readableMs / 1000),
      readablePct: t.trackedTalkMs > 0 ? Math.round((t.readableMs / t.trackedTalkMs) * 100) : null,
      topIssue: top,
      issues,
      nudgeCount: Object.values(t.nudges).reduce((a, b) => a + b, 0),
      tip: TIP[top ?? 'none'],
      kept: false,
    };
  }
}

const round1 = (v: number) => Math.round(v * 10) / 10;
