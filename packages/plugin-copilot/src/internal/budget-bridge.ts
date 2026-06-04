/**
 * @theokit/plugin-copilot — Budget bridge (P#11 internal).
 *
 * Per ADR D7 — SDK Budget per-room. Stateful in-process tracker that
 * pre-flights cost estimates + charges actual usage.
 *
 * Simplified in-memory implementation for v0.1 — production deployments
 * should wire SDK Budget (D375-D388) directly via custom dispatcher.
 *
 * @internal
 */

import type { CopilotBudgetConfig } from "../types.js";
import { CopilotError } from "../types.js";

interface BudgetState {
  dailyUsedUsd: number;
  monthlyUsedUsd: number;
  dayStartMs: number;
  monthStartMs: number;
}

/**
 * Per-copilot-per-room budget tracker.
 *
 * @internal
 */
export class BudgetBridge {
  private readonly states = new Map<string, BudgetState>();

  constructor(private readonly config: CopilotBudgetConfig | undefined) {}

  private getKey(copilotId: string, roomId: string): string {
    return `${copilotId}:${roomId}`;
  }

  private getOrInitState(key: string): BudgetState {
    let s = this.states.get(key);
    const now = Date.now();
    if (s === undefined) {
      s = {
        dailyUsedUsd: 0,
        monthlyUsedUsd: 0,
        dayStartMs: this.startOfDay(now),
        monthStartMs: this.startOfMonth(now),
      };
      this.states.set(key, s);
    }
    // Reset windows if elapsed.
    if (now >= s.dayStartMs + 86_400_000) {
      s.dailyUsedUsd = 0;
      s.dayStartMs = this.startOfDay(now);
    }
    if (now >= s.monthStartMs + 30 * 86_400_000) {
      s.monthlyUsedUsd = 0;
      s.monthStartMs = this.startOfMonth(now);
    }
    return s;
  }

  /**
   * Pre-flight check — throws {@link CopilotError} if estimated cost would
   * exceed any limit. No state mutation.
   */
  preflightCheck(copilotId: string, roomId: string, estimatedUsd: number): void {
    if (this.config === undefined || this.config.perRoom === undefined) return;
    const lim = this.config.perRoom;
    const s = this.getOrInitState(this.getKey(copilotId, roomId));

    if (lim.perRequestUsd !== undefined && estimatedUsd > lim.perRequestUsd) {
      throw new CopilotError(
        `Budget perRequestUsd ${lim.perRequestUsd} exceeded by estimate ${estimatedUsd.toFixed(4)}`,
        { code: "budget_per_request_exceeded" },
      );
    }
    if (lim.dailyUsd !== undefined && s.dailyUsedUsd + estimatedUsd > lim.dailyUsd) {
      throw new CopilotError(
        `Budget dailyUsd ${lim.dailyUsd} exceeded by estimate ${estimatedUsd.toFixed(4)} (used ${s.dailyUsedUsd.toFixed(4)})`,
        { code: "budget_daily_exceeded" },
      );
    }
    if (lim.monthlyUsd !== undefined && s.monthlyUsedUsd + estimatedUsd > lim.monthlyUsd) {
      throw new CopilotError(
        `Budget monthlyUsd ${lim.monthlyUsd} exceeded by estimate ${estimatedUsd.toFixed(4)} (used ${s.monthlyUsedUsd.toFixed(4)})`,
        { code: "budget_monthly_exceeded" },
      );
    }
  }

  /**
   * Charge actual cost after agent invocation completes.
   */
  charge(copilotId: string, roomId: string, actualUsd: number): void {
    if (this.config === undefined || this.config.perRoom === undefined) return;
    const s = this.getOrInitState(this.getKey(copilotId, roomId));
    s.dailyUsedUsd += actualUsd;
    s.monthlyUsedUsd += actualUsd;
  }

  /** Read current usage (for ops visibility / theo-ui usage-meter). */
  getUsage(copilotId: string, roomId: string): { dailyUsedUsd: number; monthlyUsedUsd: number } {
    const s = this.getOrInitState(this.getKey(copilotId, roomId));
    return { dailyUsedUsd: s.dailyUsedUsd, monthlyUsedUsd: s.monthlyUsedUsd };
  }

  private startOfDay(nowMs: number): number {
    const d = new Date(nowMs);
    d.setUTCHours(0, 0, 0, 0);
    return d.getTime();
  }

  private startOfMonth(nowMs: number): number {
    const d = new Date(nowMs);
    d.setUTCDate(1);
    d.setUTCHours(0, 0, 0, 0);
    return d.getTime();
  }
}
