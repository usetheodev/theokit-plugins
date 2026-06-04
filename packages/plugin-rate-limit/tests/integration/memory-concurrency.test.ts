/**
 * P#10 T4.2 — Memory provider concurrency test.
 *
 * 100 concurrent consume() calls on the same key with limit=10 → exactly 10
 * succeed; 90 reject. Validates sliding-window atomicity in single Node
 * process (JS event loop guarantees Map.set ordering).
 */
import { describe, expect, it } from "vitest";
import { slidingWindow } from "../../src/algorithms.js";
import { createMemoryRateLimitProvider } from "../../src/memory-provider.js";

describe("P#10 Memory provider concurrency", () => {
  it("100 concurrent consume() calls with limit=10 → exactly 10 succeed", async () => {
    const p = createMemoryRateLimitProvider({ algorithm: slidingWindow(10, 60_000) });
    const results = await Promise.all(
      Array.from({ length: 100 }, () => p.limit("user-1")),
    );
    const successes = results.filter((r) => r.success).length;
    const rejects = results.filter((r) => !r.success).length;
    expect(successes).toBe(10);
    expect(rejects).toBe(90);
  });

  it("isolated keys: 50 calls each to 2 keys with limit=5 → exactly 5 succeed each", async () => {
    const p = createMemoryRateLimitProvider({ algorithm: slidingWindow(5, 60_000) });
    const [aResults, bResults] = await Promise.all([
      Promise.all(Array.from({ length: 50 }, () => p.limit("a"))),
      Promise.all(Array.from({ length: 50 }, () => p.limit("b"))),
    ]);
    expect(aResults.filter((r) => r.success).length).toBe(5);
    expect(bResults.filter((r) => r.success).length).toBe(5);
  });
});
