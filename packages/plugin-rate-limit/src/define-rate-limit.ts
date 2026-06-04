/**
 * @theokit/plugin-rate-limit — `defineRateLimit` middleware factory (P#10).
 *
 * Per ADR D3 — unified HTTP+WS middleware. Returns a handler usable in any
 * theokit route handler OR G8 upgrade listener.
 *
 * @public
 */

import {
  type IdentifyFn,
  type LimitResult,
  type RateLimitProvider,
  type RateLimitTransport,
  type RouteLimit,
} from "./types.js";
import { RateLimitRuntime } from "./internal/runtime.js";

/**
 * Options accepted by {@link defineRateLimit}.
 *
 * @public
 */
export interface DefineRateLimitOptions {
  /** Transports this middleware applies to (informational; consumer wires per scope). */
  transports: ReadonlyArray<RateLimitTransport>;
  /** Identify callback — extracts the key string from request context. */
  identify?: IdentifyFn;
  /** Per-route limit overrides (matched by `name`). */
  limits?: ReadonlyArray<RouteLimit>;
  /** REQUIRED key prefix (multi-tenant safety). */
  keyPrefix?: string;
  /** RateLimitProvider implementation (Memory default OR Redis adapter). */
  provider: RateLimitProvider;
}

/**
 * Handler returned by {@link defineRateLimit}. Call with the request context
 * + the route/event name; receives the limit result.
 *
 * @public
 */
export interface RateLimitHandler {
  /** Apply rate-limit for the given context + route. */
  check(ctx: unknown, routeName: string): Promise<LimitResult>;
  /** Direct provider access for advanced operations. */
  readonly provider: RateLimitProvider;
  /** Configured transports (informational). */
  readonly transports: ReadonlyArray<RateLimitTransport>;
}

/**
 * Build a rate-limit middleware handler. Consumer wires `check()` at the
 * appropriate boundary (per-route HTTP middleware OR G8 upgrade listener).
 *
 * @example
 * ```ts
 * import { createMemoryRateLimitProvider, defineRateLimit, slidingWindow } from "@theokit/plugin-rate-limit";
 *
 * const limiter = defineRateLimit({
 *   transports: ["http", "ws"],
 *   keyPrefix: "myapp",
 *   provider: createMemoryRateLimitProvider({ algorithm: slidingWindow(60, 60_000) }),
 *   identify: (ctx) => (ctx as { ip: string }).ip,
 * });
 *
 * // HTTP route
 * app.post("/api/messages", async (req, res) => {
 *   const result = await limiter.check(req, "POST /api/messages");
 *   if (!result.success) return res.status(429).json({ retryAfter: result.resetAt });
 *   // ... handle request
 * });
 * ```
 *
 * @public
 */
export function defineRateLimit(opts: DefineRateLimitOptions): RateLimitHandler {
  if (opts === null || typeof opts !== "object") {
    throw new TypeError("defineRateLimit: options object is required");
  }
  if (!Array.isArray(opts.transports) || opts.transports.length === 0) {
    throw new TypeError("defineRateLimit: opts.transports must be a non-empty array");
  }
  for (const t of opts.transports) {
    if (t !== "http" && t !== "ws") {
      throw new TypeError(`defineRateLimit: unknown transport "${String(t)}" (expected 'http' | 'ws')`);
    }
  }
  if (opts.provider === undefined) {
    throw new TypeError("defineRateLimit: opts.provider is required");
  }

  const runtime = new RateLimitRuntime({
    provider: opts.provider,
    ...(opts.identify !== undefined ? { identify: opts.identify } : {}),
    ...(opts.keyPrefix !== undefined ? { keyPrefix: opts.keyPrefix } : {}),
    ...(opts.limits !== undefined ? { limits: opts.limits } : {}),
  });

  return {
    transports: opts.transports,
    provider: opts.provider,
    async check(ctx, routeName) {
      return runtime.limitForRoute(ctx, routeName);
    },
  };
}
