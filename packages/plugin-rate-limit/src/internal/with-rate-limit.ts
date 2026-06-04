/**
 * @theokit/plugin-rate-limit — `withRateLimit` G8/P#9 wrapper helper (P#10).
 *
 * Per ADR D5 — wraps a `MountedSubscriptions` (G8) OR `MountedRealtime` (P#9)
 * with pre-dispatch rate-limit check at the upgrade boundary. Mitigates P#9
 * EC-6 directly.
 *
 * @public
 */

import type { RateLimitHandler } from "../define-rate-limit.js";

/**
 * Generic shape of a "mounted" object: has http handlers OR subscription
 * factories that we wrap with rate-limit pre-dispatch. We use structural
 * typing to avoid hard import from G8/P#9.
 *
 * @public
 */
export interface RateLimitWrappable {
  handleSseRequest?: (req: unknown, res: unknown) => Promise<void> | void;
  handleWsUpgrade?: (req: unknown, socket: unknown, head: unknown) => Promise<void> | void;
}

/**
 * Options for {@link withRateLimit}.
 *
 * @public
 */
export interface WithRateLimitOptions {
  /** Rate-limit handler from {@link defineRateLimit}. */
  limiter: RateLimitHandler;
  /** Route/event name to use for the limit lookup (defaults to `transport-default`). */
  routeName?: string;
  /** Custom response when rate-limited (default returns 429 for HTTP / closes WS). */
  onLimited?: (result: { resetAt: number }, transport: "http" | "ws", ctx: unknown) => void | Promise<void>;
}

/**
 * Wrap a G8/P#9 mounted object with rate-limit pre-dispatch. Returns a new
 * object with the same shape; original is untouched.
 *
 * @example
 * ```ts
 * import { defineRateLimit, slidingWindow, createMemoryRateLimitProvider, withRateLimit } from "@theokit/plugin-rate-limit";
 * import { mountRealtime } from "@theokit/plugin-realtime";
 *
 * const limiter = defineRateLimit({
 *   transports: ["ws"],
 *   keyPrefix: "realtime",
 *   provider: createMemoryRateLimitProvider({ algorithm: slidingWindow(60, 60_000) }),
 * });
 *
 * const mounted = mountRealtime({...});
 * const limited = withRateLimit(mounted, { limiter, routeName: "realtime:cursor" });
 *
 * server.on("upgrade", limited.handleWsUpgrade);
 * ```
 *
 * @public
 */
export function withRateLimit<T extends RateLimitWrappable>(
  mounted: T,
  opts: WithRateLimitOptions,
): T {
  if (mounted === null || typeof mounted !== "object") {
    throw new TypeError("withRateLimit: mounted object is required");
  }
  if (opts.limiter === undefined) {
    throw new TypeError("withRateLimit: opts.limiter is required");
  }
  const limiter = opts.limiter;
  const routeName = opts.routeName ?? "transport-default";
  const onLimited = opts.onLimited;

  const wrapped: RateLimitWrappable = {};

  if (typeof mounted.handleSseRequest === "function") {
    const original = mounted.handleSseRequest.bind(mounted);
    wrapped.handleSseRequest = async (req: unknown, res: unknown): Promise<void> => {
      const result = await limiter.check(req, routeName);
      if (!result.success) {
        if (onLimited !== undefined) {
          await onLimited({ resetAt: result.resetAt }, "http", { req, res });
          return;
        }
        const r = res as {
          writeHead?: (code: number, headers: Record<string, string>) => void;
          end?: (data?: string) => void;
        };
        r.writeHead?.(429, {
          "content-type": "application/json",
          "retry-after": String(Math.ceil((result.resetAt - Date.now()) / 1000)),
        });
        r.end?.(JSON.stringify({ error: "rate_limited", resetAt: result.resetAt }));
        return;
      }
      await original(req, res);
    };
  }

  if (typeof mounted.handleWsUpgrade === "function") {
    const original = mounted.handleWsUpgrade.bind(mounted);
    wrapped.handleWsUpgrade = async (req: unknown, socket: unknown, head: unknown): Promise<void> => {
      const result = await limiter.check(req, routeName);
      if (!result.success) {
        if (onLimited !== undefined) {
          await onLimited({ resetAt: result.resetAt }, "ws", { req, socket, head });
          return;
        }
        const s = socket as { destroy?: () => void; write?: (data: string) => void };
        s.write?.(
          `HTTP/1.1 429 Too Many Requests\r\nRetry-After: ${Math.ceil((result.resetAt - Date.now()) / 1000)}\r\nConnection: close\r\n\r\n`,
        );
        s.destroy?.();
        return;
      }
      await original(req, socket, head);
    };
  }

  return { ...mounted, ...wrapped } as T;
}
