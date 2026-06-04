/**
 * @theokit/plugin-rate-limit — `defineRateLimitProvider` extension helper.
 *
 * Pass-through identity function with runtime guards. Used by consumers
 * shipping custom adapters (Upstash REST / CF DO / etc).
 *
 * @public
 */

import type { RateLimitProvider } from "./types.js";

/**
 * Type-only helper for consumers implementing a custom {@link RateLimitProvider}.
 *
 * @public
 */
export function defineRateLimitProvider(impl: RateLimitProvider): RateLimitProvider {
  if (impl === null || typeof impl !== "object") {
    throw new TypeError("defineRateLimitProvider: provider implementation is required");
  }
  if (typeof impl.name !== "string" || impl.name.length === 0) {
    throw new TypeError("defineRateLimitProvider: impl.name must be a non-empty string");
  }
  if (typeof impl.limit !== "function") {
    throw new TypeError("defineRateLimitProvider: impl.limit must be a function");
  }
  if (typeof impl.get !== "function") {
    throw new TypeError("defineRateLimitProvider: impl.get must be a function");
  }
  if (typeof impl.delete !== "function") {
    throw new TypeError("defineRateLimitProvider: impl.delete must be a function");
  }
  if (typeof impl.block !== "function") {
    throw new TypeError("defineRateLimitProvider: impl.block must be a function");
  }
  return impl;
}
