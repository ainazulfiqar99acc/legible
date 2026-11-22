// Turns per-tick conditions into check statuses by applying "held for N ms while speaking".

import type { CheckId, CheckStatus } from '../../../shared/types';
import { CHECK_PRIORITY } from '../../../shared/types';
import type { CheckContext, CheckTable } from './types';
import { HOLD_GAP_TOLERANCE_MS } from '../../../rules/thresholds';

export interface CheckResult {
  status: CheckStatus;
  message: string;
}

export type CheckResults = Record<CheckId, CheckResult>;

export class CheckEvaluator {
  /** start time of each active condition, keyed "check.condition" */
  private activeSince = new Map<string, number>();
  /** when the current pause in speech began (null while speaking) */
  private silentSince: number | null = null;

  constructor(private readonly table: CheckTable) {}

  evaluate(ctx: CheckContext, enabled: Record<CheckId, boolean>): CheckResults {
    const out = {} as CheckResults;
    if (ctx.speaking) this.silentSince = null;
    else this.silentSince ??= ctx.now;
    // a short pause between phrases keeps the hold timers; nothing is judged during it
    const keepTimers = !ctx.speaking && this.silentSince !== null && ctx.now - this.silentSince <= HOLD_GAP_TOLERANCE_MS;
    for (const id of CHECK_PRIORITY) {
      if (!enabled[id] || !ctx.tracked || !ctx.speaking) {
        if (!enabled[id] || !ctx.tracked || !keepTimers) this.clear(id);
        out[id] = { status: 'unknown', message: '' };
        continue;
      }
      const conds = this.table[id](ctx);
      let known = false;
      let issue: string | null = null;
      for (const c of conds) {
        const key = `${id}.${c.key}`;
        if (c.active === null) {
          this.activeSince.delete(key);
          continue;
        }
        known = true;
        if (!c.active) {
          this.activeSince.delete(key);
          continue;
        }
        const since = this.activeSince.get(key) ?? ctx.now;
        this.activeSince.set(key, since);
        if (issue === null && ctx.now - since >= c.holdMs) issue = c.message;
      }
      out[id] = issue !== null ? { status: 'issue', message: issue } : { status: known ? 'ok' : 'unknown', message: '' };
    }
    return out;
  }

  private clear(id: CheckId): void {
    for (const k of [...this.activeSince.keys()]) if (k.startsWith(`${id}.`)) this.activeSince.delete(k);
  }

  reset(): void {
    this.activeSince.clear();
    this.silentSince = null;
  }
}
