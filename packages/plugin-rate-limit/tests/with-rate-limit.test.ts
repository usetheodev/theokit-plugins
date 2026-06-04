import { describe, expect, it, vi } from "vitest";
import { slidingWindow } from "../src/algorithms.js";
import { defineRateLimit } from "../src/define-rate-limit.js";
import { createMemoryRateLimitProvider } from "../src/memory-provider.js";
import { withRateLimit } from "../src/internal/with-rate-limit.js";

function makeMockSseRequest(): { req: object; res: { writeHead: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> } } {
  return {
    req: {},
    res: { writeHead: vi.fn(), end: vi.fn() },
  };
}

function makeMockUpgrade(): {
  req: object;
  socket: { write: ReturnType<typeof vi.fn>; destroy: ReturnType<typeof vi.fn> };
  head: Buffer;
} {
  return {
    req: {},
    socket: { write: vi.fn(), destroy: vi.fn() },
    head: Buffer.alloc(0),
  };
}

describe("withRateLimit (HTTP)", () => {
  it("passes through when limit allows", async () => {
    const inner = vi.fn();
    const mounted = { handleSseRequest: inner };
    const limiter = defineRateLimit({
      transports: ["http"],
      keyPrefix: "x",
      provider: createMemoryRateLimitProvider({ algorithm: slidingWindow(5, 60_000) }),
      identify: () => "user-1",
    });
    const wrapped = withRateLimit(mounted, { limiter, routeName: "/sse" });
    const { req, res } = makeMockSseRequest();
    await wrapped.handleSseRequest?.(req, res);
    expect(inner).toHaveBeenCalledTimes(1);
    expect(res.writeHead).not.toHaveBeenCalled();
  });

  it("returns 429 + Retry-After when rate-limited", async () => {
    const inner = vi.fn();
    const mounted = { handleSseRequest: inner };
    const limiter = defineRateLimit({
      transports: ["http"],
      keyPrefix: "x",
      provider: createMemoryRateLimitProvider({ algorithm: slidingWindow(1, 60_000) }),
      identify: () => "user-1",
    });
    const wrapped = withRateLimit(mounted, { limiter, routeName: "/sse" });
    const a = makeMockSseRequest();
    const b = makeMockSseRequest();
    await wrapped.handleSseRequest?.(a.req, a.res); // ok
    await wrapped.handleSseRequest?.(b.req, b.res); // limited
    expect(inner).toHaveBeenCalledTimes(1);
    expect(b.res.writeHead).toHaveBeenCalledWith(
      429,
      expect.objectContaining({ "retry-after": expect.any(String) }),
    );
  });

  it("invokes custom onLimited when provided", async () => {
    const onLimited = vi.fn();
    const inner = vi.fn();
    const mounted = { handleSseRequest: inner };
    const limiter = defineRateLimit({
      transports: ["http"],
      keyPrefix: "x",
      provider: createMemoryRateLimitProvider({ algorithm: slidingWindow(1, 60_000) }),
      identify: () => "user-1",
    });
    const wrapped = withRateLimit(mounted, { limiter, routeName: "/sse", onLimited });
    const a = makeMockSseRequest();
    const b = makeMockSseRequest();
    await wrapped.handleSseRequest?.(a.req, a.res);
    await wrapped.handleSseRequest?.(b.req, b.res);
    expect(onLimited).toHaveBeenCalledTimes(1);
    expect(onLimited).toHaveBeenCalledWith(
      expect.objectContaining({ resetAt: expect.any(Number) }),
      "http",
      expect.any(Object),
    );
  });
});

describe("withRateLimit (WS upgrade)", () => {
  it("passes through when limit allows", async () => {
    const inner = vi.fn();
    const mounted = { handleWsUpgrade: inner };
    const limiter = defineRateLimit({
      transports: ["ws"],
      keyPrefix: "x",
      provider: createMemoryRateLimitProvider({ algorithm: slidingWindow(5, 60_000) }),
      identify: () => "user-1",
    });
    const wrapped = withRateLimit(mounted, { limiter, routeName: "/ws" });
    const { req, socket, head } = makeMockUpgrade();
    await wrapped.handleWsUpgrade?.(req, socket, head);
    expect(inner).toHaveBeenCalledTimes(1);
    expect(socket.destroy).not.toHaveBeenCalled();
  });

  it("writes 429 + destroys socket when rate-limited", async () => {
    const inner = vi.fn();
    const mounted = { handleWsUpgrade: inner };
    const limiter = defineRateLimit({
      transports: ["ws"],
      keyPrefix: "x",
      provider: createMemoryRateLimitProvider({ algorithm: slidingWindow(1, 60_000) }),
      identify: () => "user-1",
    });
    const wrapped = withRateLimit(mounted, { limiter, routeName: "/ws" });
    const a = makeMockUpgrade();
    const b = makeMockUpgrade();
    await wrapped.handleWsUpgrade?.(a.req, a.socket, a.head); // ok
    await wrapped.handleWsUpgrade?.(b.req, b.socket, b.head); // limited
    expect(inner).toHaveBeenCalledTimes(1);
    expect(b.socket.write).toHaveBeenCalledWith(expect.stringContaining("429"));
    expect(b.socket.destroy).toHaveBeenCalledTimes(1);
  });
});

describe("withRateLimit guards", () => {
  it("throws on missing limiter", () => {
    expect(() =>
      withRateLimit(
        { handleSseRequest: vi.fn() },
        // @ts-expect-error runtime guard
        { limiter: undefined },
      ),
    ).toThrow(TypeError);
  });
});
