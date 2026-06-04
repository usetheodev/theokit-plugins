import { describe, expect, it } from "vitest";
import { BudgetBridge } from "../src/internal/budget-bridge.js";
import { CopilotError } from "../src/types.js";

describe("BudgetBridge", () => {
  it("no-op when config absent", () => {
    const b = new BudgetBridge(undefined);
    expect(() => b.preflightCheck("c1", "r1", 0.5)).not.toThrow();
    b.charge("c1", "r1", 0.5);
    expect(b.getUsage("c1", "r1")).toEqual({ dailyUsedUsd: 0, monthlyUsedUsd: 0 });
  });

  it("preflight rejects perRequestUsd over-limit", () => {
    const b = new BudgetBridge({ perRoom: { perRequestUsd: 0.005 } });
    expect(() => b.preflightCheck("c1", "r1", 0.01)).toThrow(CopilotError);
  });

  it("preflight rejects dailyUsd over-limit", () => {
    const b = new BudgetBridge({ perRoom: { dailyUsd: 0.5 } });
    b.charge("c1", "r1", 0.45);
    expect(() => b.preflightCheck("c1", "r1", 0.1)).toThrow(/dailyUsd 0.5 exceeded/);
  });

  it("preflight rejects monthlyUsd over-limit", () => {
    const b = new BudgetBridge({ perRoom: { monthlyUsd: 5 } });
    b.charge("c1", "r1", 4.9);
    expect(() => b.preflightCheck("c1", "r1", 0.2)).toThrow(/monthlyUsd 5 exceeded/);
  });

  it("charge accumulates usage", () => {
    const b = new BudgetBridge({ perRoom: { dailyUsd: 10 } });
    b.charge("c1", "r1", 0.5);
    b.charge("c1", "r1", 0.7);
    expect(b.getUsage("c1", "r1").dailyUsedUsd).toBeCloseTo(1.2, 4);
  });

  it("isolates per copilot + per room", () => {
    const b = new BudgetBridge({ perRoom: { dailyUsd: 1 } });
    b.charge("c1", "r1", 0.5);
    b.charge("c2", "r1", 0.3);
    b.charge("c1", "r2", 0.2);
    expect(b.getUsage("c1", "r1").dailyUsedUsd).toBeCloseTo(0.5, 4);
    expect(b.getUsage("c2", "r1").dailyUsedUsd).toBeCloseTo(0.3, 4);
    expect(b.getUsage("c1", "r2").dailyUsedUsd).toBeCloseTo(0.2, 4);
  });

  it("preflight passes when no per-room config", () => {
    const b = new BudgetBridge({});
    expect(() => b.preflightCheck("c1", "r1", 100)).not.toThrow();
  });
});
