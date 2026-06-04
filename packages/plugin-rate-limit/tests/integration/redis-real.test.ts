/**
 * P#10 T4.1 — Real Redis integration test (env-gated by REDIS_URL).
 *
 * Honest SKIP without REDIS_URL (per real-llm-validation.md pattern adapted
 * to non-LLM infra). When set, validates Lua atomicity of sliding-window
 * under concurrent consume calls + correctness across delete/block.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { slidingWindow } from "../../src/algorithms.js";
import { createRedisRateLimitProvider, loadIoredisOrThrow, type RedisClientLike } from "../../src/redis-provider.js";

const SKIP = process.env.REDIS_URL === undefined || process.env.REDIS_URL.length === 0;

interface RedisDisconnectable extends RedisClientLike {
  quit(): Promise<void>;
}

let redis: RedisDisconnectable | null = null;

beforeAll(async () => {
  if (SKIP) return;
  const { Redis } = await loadIoredisOrThrow();
  redis = new Redis(process.env.REDIS_URL) as RedisDisconnectable;
});

afterAll(async () => {
  if (redis !== null) {
    await redis.quit();
  }
});

describe.skipIf(SKIP)("P#10 Real Redis integration (env-gated)", () => {
  it("100 concurrent consume() calls with limit=10 → exactly 10 succeed (Lua atomicity)", async () => {
    const p = createRedisRateLimitProvider({
      redis: redis as RedisClientLike,
      algorithm: slidingWindow(10, 60_000),
    });
    const key = `test-${Date.now()}-${Math.random()}`;
    const results = await Promise.all(
      Array.from({ length: 100 }, () => p.limit(key)),
    );
    const successes = results.filter((r) => r.success).length;
    expect(successes).toBe(10);
    await p.delete(key);
  });

  it("get() peeks without consuming", async () => {
    const p = createRedisRateLimitProvider({
      redis: redis as RedisClientLike,
      algorithm: slidingWindow(5, 60_000),
    });
    const key = `test-peek-${Date.now()}`;
    await p.limit(key);
    const peek1 = await p.get(key);
    const peek2 = await p.get(key);
    expect(peek1.remaining).toBe(peek2.remaining);
    await p.delete(key);
  });

  it("delete() resets the budget", async () => {
    const p = createRedisRateLimitProvider({
      redis: redis as RedisClientLike,
      algorithm: slidingWindow(2, 60_000),
    });
    const key = `test-reset-${Date.now()}`;
    await p.limit(key);
    await p.limit(key);
    const limited = await p.limit(key);
    expect(limited.success).toBe(false);
    await p.delete(key);
    const reset = await p.limit(key);
    expect(reset.success).toBe(true);
    await p.delete(key);
  });
});

describe.skipIf(!SKIP)("P#10 Real Redis integration (skipped — no REDIS_URL)", () => {
  it("honest skip per real-llm-validation.md pattern", () => {
    expect(SKIP).toBe(true);
  });
});
