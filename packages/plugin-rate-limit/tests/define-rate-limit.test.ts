import { describe, expect, it } from "vitest";
import { slidingWindow } from "../src/algorithms.js";
import { defineRateLimit } from "../src/define-rate-limit.js";
import { createMemoryRateLimitProvider } from "../src/memory-provider.js";

describe("defineRateLimit", () => {
  it("builds a RateLimitHandler with check method", () => {
    const handler = defineRateLimit({
      transports: ["http"],
      keyPrefix: "myapp",
      provider: createMemoryRateLimitProvider({ algorithm: slidingWindow(5, 60_000) }),
    });
    expect(typeof handler.check).toBe("function");
    expect(handler.transports).toEqual(["http"]);
    expect(handler.provider.name).toBe("memory");
  });

  it("applies rate-limit per route + identifier", async () => {
    const handler = defineRateLimit({
      transports: ["http"],
      keyPrefix: "myapp",
      provider: createMemoryRateLimitProvider({ algorithm: slidingWindow(2, 60_000) }),
      identify: (ctx) => (ctx as { ip: string }).ip,
    });
    const ctx = { ip: "1.2.3.4" };
    const r1 = await handler.check(ctx, "GET /api/x");
    const r2 = await handler.check(ctx, "GET /api/x");
    const r3 = await handler.check(ctx, "GET /api/x");
    expect(r1.success).toBe(true);
    expect(r2.success).toBe(true);
    expect(r3.success).toBe(false);
  });

  it("isolates limits per route name", async () => {
    const handler = defineRateLimit({
      transports: ["http"],
      keyPrefix: "myapp",
      provider: createMemoryRateLimitProvider({ algorithm: slidingWindow(1, 60_000) }),
      identify: () => "user-1",
    });
    expect((await handler.check({}, "/a")).success).toBe(true);
    expect((await handler.check({}, "/b")).success).toBe(true);
    expect((await handler.check({}, "/a")).success).toBe(false);
  });

  it("isolates limits per identifier", async () => {
    const handler = defineRateLimit({
      transports: ["http"],
      keyPrefix: "myapp",
      provider: createMemoryRateLimitProvider({ algorithm: slidingWindow(1, 60_000) }),
      identify: (ctx) => (ctx as { ip: string }).ip,
    });
    expect((await handler.check({ ip: "a" }, "/r")).success).toBe(true);
    expect((await handler.check({ ip: "b" }, "/r")).success).toBe(true);
    expect((await handler.check({ ip: "a" }, "/r")).success).toBe(false);
  });

  it("rejects empty transports", () => {
    expect(() =>
      defineRateLimit({
        transports: [],
        keyPrefix: "x",
        provider: createMemoryRateLimitProvider({ algorithm: slidingWindow(1, 1000) }),
      }),
    ).toThrow(TypeError);
  });

  it("rejects unknown transport", () => {
    expect(() =>
      defineRateLimit({
        // @ts-expect-error runtime guard
        transports: ["smtp"],
        keyPrefix: "x",
        provider: createMemoryRateLimitProvider({ algorithm: slidingWindow(1, 1000) }),
      }),
    ).toThrow(TypeError);
  });

  it("rejects missing provider", () => {
    expect(() =>
      defineRateLimit({
        transports: ["http"],
        keyPrefix: "x",
        // @ts-expect-error runtime guard
        provider: undefined,
      }),
    ).toThrow(TypeError);
  });

  it("respects per-route points config", async () => {
    const handler = defineRateLimit({
      transports: ["http"],
      keyPrefix: "myapp",
      provider: createMemoryRateLimitProvider({ algorithm: slidingWindow(10, 60_000) }),
      identify: () => "user-1",
      limits: [{ name: "/heavy", points: 5 }],
    });
    const r1 = await handler.check({}, "/heavy"); // -5
    const r2 = await handler.check({}, "/heavy"); // -5 (10 used)
    const r3 = await handler.check({}, "/heavy"); // would exceed
    expect(r1.success).toBe(true);
    expect(r2.success).toBe(true);
    expect(r3.success).toBe(false);
  });
});
