/**
 * @theokit/plugin-rate-limit — RateLimitRuntime (P#10 internal orchestrator).
 *
 * Per ADRs D3 + D6 + D7 — owns provider + identify + keyPrefix logic in one
 * place; `defineRateLimit` middleware delegates here.
 *
 * @internal
 */

import {
  type IdentifyFn,
  type LimitResult,
  RateLimitConfigError,
  type RateLimitProvider,
  type RouteLimit,
} from "../types.js";

const DEFAULT_KEY_PREFIX = "@theokit/rate-limit";
let warnedAboutMissingPrefix = false;

/**
 * Options accepted by {@link RateLimitRuntime}.
 *
 * @internal
 */
export interface RateLimitRuntimeOptions {
  provider: RateLimitProvider;
  /** Identify callback (default: extract IP). */
  identify?: IdentifyFn;
  /** REQUIRED key prefix (warn if absent per ADR D7). */
  keyPrefix?: string;
  /** Per-route limit overrides. */
  limits?: ReadonlyArray<RouteLimit>;
}

/**
 * Default identify: prefers `req.headers['x-forwarded-for']` first hop, falls
 * back to `req.socket.remoteAddress`, else 'unknown'.
 *
 * Consumer is RESPONSIBLE for trusting X-Forwarded-For only behind a trusted
 * proxy. The README documents this.
 *
 * @internal
 */
export const defaultIdentify: IdentifyFn = (ctx) => {
  if (ctx === null || typeof ctx !== "object") return "unknown";
  const obj = ctx as {
    headers?: Record<string, string | string[] | undefined>;
    socket?: { remoteAddress?: string };
    connectionId?: string;
  };
  if (typeof obj.connectionId === "string") return obj.connectionId;
  const xff = obj.headers?.["x-forwarded-for"];
  if (typeof xff === "string") {
    const first = xff.split(",")[0]?.trim();
    if (first !== undefined && first.length > 0) return first;
  }
  if (Array.isArray(xff) && xff.length > 0 && typeof xff[0] === "string") {
    const first = xff[0].split(",")[0]?.trim();
    if (first !== undefined && first.length > 0) return first;
  }
  if (typeof obj.socket?.remoteAddress === "string") return obj.socket.remoteAddress;
  return "unknown";
};

/**
 * Orchestrator over a {@link RateLimitProvider}. Composes keyPrefix +
 * identify + per-route limits.
 *
 * @internal
 */
export class RateLimitRuntime {
  private readonly provider: RateLimitProvider;
  private readonly identify: IdentifyFn;
  private readonly keyPrefix: string;
  private readonly limitsByName: Map<string, RouteLimit>;

  constructor(opts: RateLimitRuntimeOptions) {
    if (opts === null || typeof opts !== "object") {
      throw new RateLimitConfigError("RateLimitRuntime: options object is required");
    }
    if (opts.provider === undefined) {
      throw new RateLimitConfigError("RateLimitRuntime: opts.provider is required");
    }
    if (opts.keyPrefix === undefined || opts.keyPrefix.length === 0) {
      if (!warnedAboutMissingPrefix) {
        console.warn(
          `[@theokit/plugin-rate-limit] keyPrefix not provided; using default "${DEFAULT_KEY_PREFIX}". Set keyPrefix explicitly to avoid cross-app collisions in multi-tenant Redis.`,
        );
        warnedAboutMissingPrefix = true;
      }
    }
    this.provider = opts.provider;
    this.identify = opts.identify ?? defaultIdentify;
    this.keyPrefix = opts.keyPrefix ?? DEFAULT_KEY_PREFIX;
    this.limitsByName = new Map();
    for (const lim of opts.limits ?? []) {
      this.limitsByName.set(lim.name, lim);
    }
  }

  /** Compose full key from prefix + route name + identifier. */
  buildKey(routeName: string, identifier: string): string {
    return `${this.keyPrefix}:${routeName}:${identifier}`;
  }

  /** Look up per-route override. */
  getRouteLimit(routeName: string): RouteLimit | undefined {
    return this.limitsByName.get(routeName);
  }

  /** Apply rate-limit for a request context + route name. */
  async limitForRoute(ctx: unknown, routeName: string): Promise<LimitResult> {
    const identifier = await this.identify(ctx);
    const key = this.buildKey(routeName, identifier);
    const routeLim = this.limitsByName.get(routeName);
    const points = routeLim?.points ?? 1;
    return this.provider.limit(key, points);
  }

  /** Direct provider access for advanced consumers. */
  get rawProvider(): RateLimitProvider {
    return this.provider;
  }
}

/**
 * Reset the module-level "warned" flag — exposed for tests only.
 *
 * @internal
 */
export function _resetWarnFlag(): void {
  warnedAboutMissingPrefix = false;
}
