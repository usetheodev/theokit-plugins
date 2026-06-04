/**
 * @theokit/plugin-rate-limit — public barrel (P#10 v0.1.0).
 *
 * Per ADRs D1-D8 (blueprint p10-plugin-rate-limit SHIPPABLE 99.2).
 *
 * @public
 */

export {
  type AlgorithmConfig,
  type IdentifyFn,
  type LimitResult,
  RateLimitConfigError,
  RateLimitError,
  type RateLimitProvider,
  RateLimitProviderError,
  type RateLimitTransport,
  type RouteLimit,
} from "./types.js";

export { fixedWindow, slidingWindow, tokenBucket } from "./algorithms.js";

export {
  LUA_BLOCK,
  LUA_FIXED_WINDOW,
  LUA_SLIDING_WINDOW,
  LUA_TOKEN_BUCKET,
} from "./lua-scripts.js";

export {
  createMemoryRateLimitProvider,
  type MemoryRateLimitProviderOptions,
} from "./memory-provider.js";

export {
  createRedisRateLimitProvider,
  loadIoredisOrThrow,
  type RedisClientLike,
  type RedisRateLimitProviderOptions,
} from "./redis-provider.js";

export { defineRateLimitProvider } from "./provider.js";

export {
  defineRateLimit,
  type DefineRateLimitOptions,
  type RateLimitHandler,
} from "./define-rate-limit.js";

export {
  RateLimitRuntime,
  type RateLimitRuntimeOptions,
} from "./internal/runtime.js";

export {
  type RateLimitWrappable,
  withRateLimit,
  type WithRateLimitOptions,
} from "./internal/with-rate-limit.js";
