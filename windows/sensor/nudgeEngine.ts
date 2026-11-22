// One active nudge at a time, by priority, with rate limits so Legible never nags.
//
// Rules (plan section 6):
//  - one active nudge; priority Facing > Light > Distance > Pace > Occlusion > Phrase
//  - a nudge clears after 2 s without its issue (good state, or the user stopped talking)
//  - at most one new nudge per 5 s
//  - the same nudge does not repeat within 30 s unless the previous one lasted > 10 s
//  - not tracked = no judgement: an active nudge is dropped at once
//  - a higher-priority issue may replace the active nudge, still subject to the 5 s limit

import type { CheckId, Nudge } from '../../shared/types';
import { CHECK_PRIORITY } from '../../shared/types';
import {
  NUDGE_CLEAR_MS,
  NUDGE_MIN_INTERVAL_MS,
  NUDGE_REPEAT_EXEMPT_MS,
  NUDGE_REPEAT_MS,
} from '../../rules/thresholds';
import type { CheckResults } from './checks/evaluate';

export type EngineEvent =
  | { t: number; type: 'nudge'; check: CheckId; message: string }
  | { t: number; type: 'clear'; check: CheckId; lastedMs: number; reason: 'good' | 'untracked' | 'replaced' | 'stopped' }
  | { t: number; type: 'suppressed'; check: CheckId; reason: 'interval' | 'repeat' };

interface History {
  startedAt: number;
  endedAt: number;
  lastedMs: number;
}

export class NudgeEngine {
  active: Nudge | null = null;
  private lastIssueT = 0;
  private lastNewNudgeT = Number.NEGATIVE_INFINITY;
  private history = new Map<CheckId, History>();
  readonly events: EngineEvent[] = [];
  /** which suppressions we already logged, to keep the log short */
  private loggedSuppression = new Set<string>();

  update(now: number, results: CheckResults, tracked: boolean): Nudge | null {
    if (!tracked) {
      if (this.active) this.end(now, 'untracked');
      return null;
    }

    // keep or clear the active nudge
    if (this.active) {
      const r = results[this.active.check];
      if (r.status === 'issue') {
        this.lastIssueT = now;
        this.active.message = r.message;
      } else if (now - this.lastIssueT >= NUDGE_CLEAR_MS) {
        this.end(now, 'good');
      }
    }

    // choose the highest-priority issue
    for (const id of CHECK_PRIORITY) {
      const r = results[id];
      if (r.status !== 'issue') continue;
      if (this.active?.check === id) break; // already showing the most important one
      if (this.active && CHECK_PRIORITY.indexOf(this.active.check) < CHECK_PRIORITY.indexOf(id)) break;
      const why = this.blocked(now, id);
      if (why) {
        const key = `${id}:${why}:${this.history.get(id)?.startedAt ?? 0}:${Math.floor(this.lastNewNudgeT)}`;
        if (!this.loggedSuppression.has(key)) {
          this.loggedSuppression.add(key);
          this.events.push({ t: now, type: 'suppressed', check: id, reason: why });
        }
        continue; // a lower-priority issue may still be allowed
      }
      if (this.active) this.end(now, 'replaced');
      this.active = { check: id, message: r.message, since: now };
      this.lastIssueT = now;
      this.lastNewNudgeT = now;
      this.events.push({ t: now, type: 'nudge', check: id, message: r.message });
      break;
    }
    return this.active;
  }

  private blocked(now: number, id: CheckId): 'interval' | 'repeat' | null {
    if (now - this.lastNewNudgeT < NUDGE_MIN_INTERVAL_MS) return 'interval';
    const h = this.history.get(id);
    if (h && now - h.startedAt < NUDGE_REPEAT_MS && h.lastedMs <= NUDGE_REPEAT_EXEMPT_MS) return 'repeat';
    return null;
  }

  private end(now: number, reason: 'good' | 'untracked' | 'replaced' | 'stopped'): void {
    const a = this.active;
    if (!a) return;
    const lastedMs = now - a.since;
    this.history.set(a.check, { startedAt: a.since, endedAt: now, lastedMs });
    this.events.push({ t: now, type: 'clear', check: a.check, lastedMs, reason });
    this.active = null;
  }

  stop(now: number): void {
    this.end(now, 'stopped');
  }
}
