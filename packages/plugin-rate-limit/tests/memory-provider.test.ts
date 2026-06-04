import { describe, expect, it } from "vitest";
import { fixedWindow, slidingWindow, tokenBucket } from "../src/algorithms.js";
import { createMemoryRateLimitProvider } from "../src/memory-provider.js";

describe("MemoryRateLimitProvider — slidingWindow", () => {
  it("allows up to maxTokens then rejects", async () => {
    const p = createMemoryRateLimitProvider({ algorithm: slidingWindow(3, 60_000) });
    const r1 = await p.limit("k");
    const r2 = await p.limit("k");
    const r3 = await p.limit("k");
    const r4 = await p.limit("k");
    expect(r1.success).toBe(true);
    expect(r2.success).toBe(true);
    expect(r3.success).toBe(true);
    expect(r4.success).toBe(false);
    expect(r4.remaining).toBe(0);
  });

  it("decrements remaining on each consume", async () => {
    const p = createMemoryRateLimitProvider({ algorithm: slidingWindow(5, 60_000) });
    const r1 = await p.limit("k");
    const r2 = await p.limit("k");
    expect(r1.remaining).toBe(4);
    expect(r2.remaining).toBe(3);
  });

  it("isolates keys", async () => {
    const p = createMemoryRateLimitProvider({ algorithm: slidingWindow(1, 60_000) });
    expect((await p.limit("a")).success).toBe(true);
    expect((await p.limit("a")).success).toBe(false);
    expect((await p.limit("b")).success).toBe(true);
  });

  it("get() peeks without consuming", async () => {
    const p = createMemoryRateLimitProvider({ algorithm: slidingWindow(5, 60_000) });
    await p.limit("k");
    const peek1 = await p.get("k");
    const peek2 = await p.get("k");
    expect(peek1.remaining).toBe(peek2.remaining);
    expect(peek1.remaining).toBe(4);
  });

  it("delete() resets the budget", async () => {
    const p = createMemoryRateLimitProvider({ algorithm: slidingWindow(2, 60_000) });
    await p.limit("k");
    await p.limit("k");
    expect((await p.limit("k")).success).toBe(false);
    await p.delete("k");
    expect((await p.limit("k")).success).toBe(true);
  });

  it("block() denies the key for the duration", async () => {
    const p = createMemoryRateLimitProvider({ algorithm: slidingWindow(10, 60_000) });
    await p.block("k", 60);
    const r = await p.limit("k");
    expect(r.success).toBe(false);
  });
});

describe("MemoryRateLimitProvider — tokenBucket", () => {
  it("allows up to capacity then rejects", async () => {
    const p = createMemoryRateLimitProvider({ algorithm: tokenBucket(1, 3) });
    expect((await p.limit("k")).success).toBe(true);
    expect((await p.limit("k")).success).toBe(true);
    expect((await p.limit("k")).success).toBe(true);
    expect((await p.limit("k")).success).toBe(false);
  });

  it("refills over time", async () => {
    const p = createMemoryRateLimitProvider({ algorithm: tokenBucket(1000, 2) });
    await p.limit("k");
    await p.limit("k");
    // Wait > 1ms; refill should give us at least 1 token back.
    await new Promise((r) => setTimeout(r, 5));
    expect((await p.limit("k")).success).toBe(true);
  });

  it("get() reflects current bucket level", async () => {
    const p = createMemoryRateLimitProvider({ algorithm: tokenBucket(1, 5) });
    const peek = await p.get("new-key");
    expect(peek.remaining).toBe(5);
  });
});

describe("MemoryRateLimitProvider — fixedWindow", () => {
  it("allows up to maxTokens per window", async () => {
    const p = createMemoryRateLimitProvider({ algorithm: fixedWindow(2, 60_000) });
    expect((await p.limit("k")).success).toBe(true);
    expect((await p.limit("k")).success).toBe(true);
    expect((await p.limit("k")).success).toBe(false);
  });

  it("isolates between keys", async () => {
    const p = createMemoryRateLimitProvider({ algorithm: fixedWindow(1, 60_000) });
    expect((await p.limit("a")).success).toBe(true);
    expect((await p.limit("b")).success).toBe(true);
  });
});

describe("MemoryRateLimitProvider — maxKeys LRU", () => {
  it("evicts oldest key when maxKeys exceeded", async () => {
    const p = createMemoryRateLimitProvider({
      algorithm: slidingWindow(1, 60_000),
      maxKeys: 2,
    });
    await p.limit("a"); // success, remaining 0
    await p.limit("b"); // success, remaining 0
    await p.limit("c"); // triggers eviction of "a"
    // "a" was evicted → consumes again as fresh.
    expect((await p.limit("a")).success).toBe(true);
  });
});

describe("MemoryRateLimitProvider — constructor guards", () => {
  it("throws on missing algorithm", () => {
    expect(() =>
      createMemoryRateLimitProvider({
        // @ts-expect-error runtime guard
        algorithm: undefined,
      }),
    ).toThrow(TypeError);
  });
});
