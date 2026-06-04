/**
 * @theokit/plugin-rate-limit — Type contract (P#10 v0.1.0).
 *
 * Per ADRs D1-D8 (blueprint p10-plugin-rate-limit SHIPPABLE 99.2).
 *
 * @public
 */

/**
 * Result of a `provider.limit(key)` call. Never throws on rate-limit reject —
 * caller branches on `success: false` per ADR D6 (Upstash pattern).
 *
 * @public
 */
export interface LimitResult {
  /** Whether the request is allowed (true) or rate-limited (false). */
  readonly success: boolean;
  /** Max requests allowed in the window. */
  readonly limit: number;
  /** Remaining requests in the current window. */
  readonly remaining: number;
  /** Unix ms timestamp when the limit resets. */
  readonly resetAt: number;
}

/**
 * Algorithm config — discriminated union per ADR D1.
 *
 * @public
 */
export type AlgorithmConfig =
  | { readonly kind: "slidingWindow"; readonly tokens: number; readonly windowMs: number }
  | { readonly kind: "tokenBucket"; readonly refillRate: number; readonly capacity: number }
  | { readonly kind: "fixedWindow"; readonly tokens: number; readonly windowMs: number };

/**
 * Provider abstraction. Backends (Memory + Redis + custom) implement this.
 *
 * @public
 */
export interface RateLimitProvider {
  readonly name: string;

  /**
   * Consume `points` from the key's budget. Returns the result (success or
   * rate-limited). Never throws on rate-limit reject.
   *
   * Throws {@link RateLimitProviderError} on backend infrastructure failure
   * (Redis disconnect, etc.).
   */
  limit(key: string, points?: number): Promise<LimitResult>;

  /** Read current limit state without consuming. */
  get(key: string): Promise<LimitResult>;

  /** Reset the key's budget. */
  delete(key: string): Promise<void>;

  /** Block the key for `secondsToBlock` (subsequent limit() returns success=false). */
  block(key: string, secondsToBlock: number): Promise<void>;
}

/**
 * Identify callback — receives request context (HTTP req OR G8 SubscriptionCtx)
 * and returns the rate-limit key. Per ADR D6.
 *
 * @public
 */
export type IdentifyFn = (ctx: unknown) => string | Promise<string>;

/**
 * Supported transports for {@link defineRateLimit} middleware.
 *
 * @public
 */
export type RateLimitTransport = "http" | "ws";

/**
 * Per-route or per-event limit config.
 *
 * @public
 */
export interface RouteLimit {
  /** Route or event name (pattern). */
  readonly name: string;
  /** Algorithm config — overrides provider's default if specified. */
  readonly algorithm?: AlgorithmConfig;
  /** Points consumed per matched request (default 1). */
  readonly points?: number;
}

/**
 * Base error for the rate-limit subsystem. Standalone (does NOT extend
 * TheokitAgentError — plugin boundary). Consumers branch on `instanceof Error`.
 *
 * @public
 */
export class RateLimitError extends Error {
  override readonly name: string = "RateLimitError";
  readonly code?: string;

  constructor(message: string, options: { code?: string; cause?: unknown } = {}) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    if (options.code !== undefined) this.code = options.code;
  }
}

/**
 * Thrown when the backend provider fails (Redis disconnect, Lua script error).
 *
 * @public
 */
export class RateLimitProviderError extends RateLimitError {
  override readonly name: string = "RateLimitProviderError";

  constructor(message: string, options: { code?: string; cause?: unknown } = {}) {
    super(message, { code: options.code ?? "provider_failure", cause: options.cause });
  }
}

/**
 * Thrown when the plugin config is invalid (missing keyPrefix in production,
 * conflicting algorithms, etc.).
 *
 * @public
 */
export class RateLimitConfigError extends RateLimitError {
  override readonly name: string = "RateLimitConfigError";

  constructor(message: string, options: { code?: string; cause?: unknown } = {}) {
    super(message, { code: options.code ?? "config_invalid", cause: options.cause });
  }
}
