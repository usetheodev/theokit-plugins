/**
 * @theokit/plugin-rate-limit — RedisRateLimitProvider (P#10 opt-in).
 *
 * Per ADR D2 (Redis adapter via ioredis ^5 optional peer) + D4 (Lua-script
 * atomicity REQUIRED). Dynamic `import('ioredis')` with actionable
 * `RateLimitProviderError` on missing peer.
 *
 * @public
 */

import type { AlgorithmConfig, LimitResult, RateLimitProvider } from "./types.js";
import { RateLimitProviderError } from "./types.js";
import {
  LUA_BLOCK,
  LUA_FIXED_WINDOW,
  LUA_SLIDING_WINDOW,
  LUA_TOKEN_BUCKET,
} from "./lua-scripts.js";

/**
 * Structural type for ioredis Redis client. Avoids hard import while peer
 * may be absent at module-load time.
 *
 * @internal
 */
export interface RedisClientLike {
  eval(script: string, numKeys: number, ...args: (string | number)[]): Promise<unknown>;
  evalsha?(sha: string, numKeys: number, ...args: (string | number)[]): Promise<unknown>;
  del(...keys: string[]): Promise<number>;
}

/**
 * Options accepted by {@link createRedisRateLimitProvider}.
 *
 * @public
 */
export interface RedisRateLimitProviderOptions {
  /** ioredis client instance (consumer-supplied; must be connected). */
  redis: RedisClientLike;
  /** Algorithm to apply on all keys. */
  algorithm: AlgorithmConfig;
}

/**
 * Create a Redis-backed rate-limit provider. Lua scripts executed atomically
 * per request (single round-trip).
 *
 * Consumer MUST install `ioredis ^5` as a peer:
 * ```bash
 * pnpm add ioredis
 * ```
 *
 * @public
 */
export function createRedisRateLimitProvider(
  opts: RedisRateLimitProviderOptions,
): RateLimitProvider {
  if (opts === null || typeof opts !== "object") {
    throw new TypeError("createRedisRateLimitProvider: opts is required");
  }
  if (opts.redis === undefined || typeof opts.redis.eval !== "function") {
    throw new TypeError(
      "createRedisRateLimitProvider: opts.redis must be a ioredis client (eval + del methods)",
    );
  }
  if (opts.algorithm === undefined) {
    throw new TypeError("createRedisRateLimitProvider: opts.algorithm is required");
  }
  const redis = opts.redis;
  const algorithm = opts.algorithm;

  const script = scriptFor(algorithm);
  const limitOf = limitValueOf(algorithm);

  const runScript = async (
    key: string,
    nowMs: number,
    points: number,
  ): Promise<[number, number, number]> => {
    try {
      const args = argsFor(algorithm, nowMs, points);
      const raw = (await redis.eval(script, 1, key, ...args)) as [number, number, number];
      return raw;
    } catch (cause) {
      throw new RateLimitProviderError(
        `Redis EVAL failed for rate-limit key "${key}": ${(cause as Error).message ?? "unknown"}`,
        { code: "redis_eval_failed", cause },
      );
    }
  };

  return {
    name: "redis",

    async limit(key, points = 1): Promise<LimitResult> {
      const nowMs = Date.now();
      const [success, remaining, resetAt] = await runScript(key, nowMs, points);
      return { success: success === 1, limit: limitOf, remaining, resetAt };
    },

    async get(key): Promise<LimitResult> {
      // For Redis backend, "get" runs the same script with 0 points (peek).
      const nowMs = Date.now();
      const [success, remaining, resetAt] = await runScript(key, nowMs, 0);
      return { success: success === 1, limit: limitOf, remaining, resetAt };
    },

    async delete(key): Promise<void> {
      try {
        await redis.del(key, `${key}:blocked`);
      } catch (cause) {
        throw new RateLimitProviderError(
          `Redis DEL failed for rate-limit key "${key}": ${(cause as Error).message ?? "unknown"}`,
          { code: "redis_del_failed", cause },
        );
      }
    },

    async block(key, secondsToBlock): Promise<void> {
      try {
        await redis.eval(LUA_BLOCK, 1, key, secondsToBlock);
      } catch (cause) {
        throw new RateLimitProviderError(
          `Redis BLOCK failed for rate-limit key "${key}": ${(cause as Error).message ?? "unknown"}`,
          { code: "redis_block_failed", cause },
        );
      }
    },
  };
}

function scriptFor(algorithm: AlgorithmConfig): string {
  switch (algorithm.kind) {
    case "slidingWindow":
      return LUA_SLIDING_WINDOW;
    case "fixedWindow":
      return LUA_FIXED_WINDOW;
    case "tokenBucket":
      return LUA_TOKEN_BUCKET;
  }
}

function argsFor(algorithm: AlgorithmConfig, nowMs: number, points: number): (string | number)[] {
  switch (algorithm.kind) {
    case "slidingWindow":
      return [nowMs, algorithm.windowMs, algorithm.tokens, points];
    case "fixedWindow":
      return [nowMs, algorithm.windowMs, algorithm.tokens, points];
    case "tokenBucket":
      return [nowMs, algorithm.refillRate, algorithm.capacity, points];
  }
}

function limitValueOf(algorithm: AlgorithmConfig): number {
  switch (algorithm.kind) {
    case "slidingWindow":
    case "fixedWindow":
      return algorithm.tokens;
    case "tokenBucket":
      return algorithm.capacity;
  }
}

/**
 * Dynamic-import helper for consumers who want to lazy-load ioredis only when
 * the Redis provider is actually used. Throws actionable {@link RateLimitProviderError}
 * on missing peer.
 *
 * @public
 */
export async function loadIoredisOrThrow(): Promise<{
  Redis: new (opts?: unknown) => RedisClientLike;
}> {
  try {
    const mod = (await import("ioredis")) as unknown as {
      default: new (opts?: unknown) => RedisClientLike;
    };
    return { Redis: mod.default };
  } catch (cause) {
    throw new RateLimitProviderError(
      "`ioredis` peer dependency not installed. Run `pnpm add ioredis` to use the Redis rate-limit provider.",
      { code: "ioredis_peer_missing", cause },
    );
  }
}
