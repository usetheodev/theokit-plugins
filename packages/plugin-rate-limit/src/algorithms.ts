/**
 * @theokit/plugin-rate-limit — Algorithm factory constants (P#10).
 *
 * Per ADR D1 — sliding-window default + token-bucket + fixed-window opt-in.
 * Mirrors upstash-ratelimit `static slidingWindow / fixedWindow / tokenBucket`
 * factories (`references/upstash-ratelimit/src/single.ts:160,278,399`).
 *
 * @public
 */

import type { AlgorithmConfig } from "./types.js";

/**
 * Sliding window: tokens allowed per `windowMs`; weighted average of current +
 * previous window count = smooth rate.
 *
 * @public
 */
export function slidingWindow(tokens: number, windowMs: number): AlgorithmConfig {
  if (!Number.isInteger(tokens) || tokens <= 0) {
    throw new TypeError(`slidingWindow: tokens must be a positive integer; got ${String(tokens)}`);
  }
  if (!Number.isInteger(windowMs) || windowMs <= 0) {
    throw new TypeError(`slidingWindow: windowMs must be a positive integer; got ${String(windowMs)}`);
  }
  return { kind: "slidingWindow", tokens, windowMs };
}

/**
 * Token bucket: refill `refillRate` tokens per second up to `capacity`.
 * Burst-friendly — consumer can spend up to `capacity` tokens immediately.
 *
 * @public
 */
export function tokenBucket(refillRate: number, capacity: number): AlgorithmConfig {
  if (!Number.isFinite(refillRate) || refillRate <= 0) {
    throw new TypeError(`tokenBucket: refillRate must be a positive number; got ${String(refillRate)}`);
  }
  if (!Number.isInteger(capacity) || capacity <= 0) {
    throw new TypeError(`tokenBucket: capacity must be a positive integer; got ${String(capacity)}`);
  }
  return { kind: "tokenBucket", refillRate, capacity };
}

/**
 * Fixed window: `tokens` allowed per `windowMs`. Simple counter; resets at
 * window boundary. Allows up to 2× burst at boundary (LWW per window).
 *
 * @public
 */
export function fixedWindow(tokens: number, windowMs: number): AlgorithmConfig {
  if (!Number.isInteger(tokens) || tokens <= 0) {
    throw new TypeError(`fixedWindow: tokens must be a positive integer; got ${String(tokens)}`);
  }
  if (!Number.isInteger(windowMs) || windowMs <= 0) {
    throw new TypeError(`fixedWindow: windowMs must be a positive integer; got ${String(windowMs)}`);
  }
  return { kind: "fixedWindow", tokens, windowMs };
}
