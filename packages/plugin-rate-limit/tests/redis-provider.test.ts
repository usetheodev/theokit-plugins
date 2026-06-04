import { describe, expect, it, vi } from "vitest";
import { slidingWindow } from "../src/algorithms.js";
import { createRedisRateLimitProvider, loadIoredisOrThrow } from "../src/redis-provider.js";
import { RateLimitProviderError } from "../src/types.js";

function makeMockRedis(evalResult: [number, number, number]) {
  return {
    eval: vi.fn().mockResolvedValue(evalResult),
    del: vi.fn().mockResolvedValue(1),
  };
}

describe("createRedisRateLimitProvider (mock client)", () => {
  it("limit() delegates to eval with the right script + args shape", async () => {
    const redis = makeMockRedis([1, 4, Date.now() + 60_000]);
    const p = createRedisRateLimitProvider({
      redis,
      algorithm: slidingWindow(5, 60_000),
    });
    const result = await p.limit("user-1");
    expect(redis.eval).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(true);
    expect(result.remaining).toBe(4);
    expect(result.limit).toBe(5);
  });

  it("limit() returns success=false when eval returns 0", async () => {
    const resetAt = Date.now() + 30_000;
    const redis = makeMockRedis([0, 0, resetAt]);
    const p = createRedisRateLimitProvider({
      redis,
      algorithm: slidingWindow(5, 60_000),
    });
    const result = await p.limit("user-1");
    expect(result.success).toBe(false);
    expect(result.resetAt).toBe(resetAt);
  });

  it("get() runs the same script with 0 points (peek)", async () => {
    const redis = makeMockRedis([1, 5, Date.now() + 60_000]);
    const p = createRedisRateLimitProvider({
      redis,
      algorithm: slidingWindow(5, 60_000),
    });
    await p.get("k");
    const lastCall = redis.eval.mock.calls.at(-1) ?? [];
    expect(lastCall.at(-1)).toBe(0);
  });

  it("delete() calls redis.del on key + blocked marker", async () => {
    const redis = makeMockRedis([1, 5, 0]);
    const p = createRedisRateLimitProvider({
      redis,
      algorithm: slidingWindow(5, 60_000),
    });
    await p.delete("user-1");
    expect(redis.del).toHaveBeenCalledWith("user-1", "user-1:blocked");
  });

  it("block() calls eval with LUA_BLOCK + secondsToBlock", async () => {
    const redis = makeMockRedis([1, 0, 0]);
    const p = createRedisRateLimitProvider({
      redis,
      algorithm: slidingWindow(5, 60_000),
    });
    await p.block("user-1", 60);
    const lastCall = redis.eval.mock.calls.at(-1) ?? [];
    expect(lastCall[1]).toBe(1); // numKeys
    expect(lastCall[2]).toBe("user-1"); // key
    expect(lastCall[3]).toBe(60); // seconds
  });

  it("wraps eval errors as RateLimitProviderError", async () => {
    const redis = {
      eval: vi.fn().mockRejectedValue(new Error("connection lost")),
      del: vi.fn(),
    };
    const p = createRedisRateLimitProvider({
      redis,
      algorithm: slidingWindow(5, 60_000),
    });
    await expect(p.limit("k")).rejects.toThrow(RateLimitProviderError);
  });

  it("throws on missing redis", () => {
    expect(() =>
      createRedisRateLimitProvider({
        // @ts-expect-error runtime guard
        redis: undefined,
        algorithm: slidingWindow(5, 60_000),
      }),
    ).toThrow(TypeError);
  });
});

describe("loadIoredisOrThrow", () => {
  it("loads ioredis successfully (peer installed)", async () => {
    const { Redis } = await loadIoredisOrThrow();
    expect(typeof Redis).toBe("function");
  });
});
