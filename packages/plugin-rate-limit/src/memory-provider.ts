/**
 * @theokit/plugin-rate-limit — MemoryRateLimitProvider (P#10 default).
 *
 * Per ADR D2 — in-process zero-dep default. Per-algorithm impl with LRU-style
 * eviction at `maxKeys` cap (default 10000 per blueprint EC-7 DoS mitigation).
 *
 * @public
 */

import type { AlgorithmConfig, LimitResult, RateLimitProvider } from "./types.js";

interface SlidingWindowState {
  readonly kind: "slidingWindow";
  /** Map<windowIndex, count> for the past 2 windows. */
  windows: Map<number, number>;
  /** Soft TTL for LRU eviction. */
  lastTouchedMs: number;
}

interface TokenBucketState {
  readonly kind: "tokenBucket";
  tokens: number;
  lastRefillMs: number;
}

interface FixedWindowState {
  readonly kind: "fixedWindow";
  windowIndex: number;
  count: number;
}

interface BlockedState {
  readonly kind: "blocked";
  untilMs: number;
}

type EntryState = SlidingWindowState | TokenBucketState | FixedWindowState;

/**
 * Options accepted by {@link createMemoryRateLimitProvider}.
 *
 * @public
 */
export interface MemoryRateLimitProviderOptions {
  /** Algorithm to apply on all keys. */
  algorithm: AlgorithmConfig;
  /** Max distinct keys before LRU eviction triggers (DoS guard). Default 10000. */
  maxKeys?: number;
}

const DEFAULT_MAX_KEYS = 10_000;

/**
 * Create an in-process memory rate-limit provider.
 *
 * @public
 */
export function createMemoryRateLimitProvider(
  opts: MemoryRateLimitProviderOptions,
): RateLimitProvider {
  if (opts === null || typeof opts !== "object" || opts.algorithm === undefined) {
    throw new TypeError("createMemoryRateLimitProvider: opts.algorithm is required");
  }
  const algorithm = opts.algorithm;
  const maxKeys = opts.maxKeys ?? DEFAULT_MAX_KEYS;
  const states = new Map<string, EntryState>();
  const blocks = new Map<string, BlockedState>();

  const touchLru = (key: string, entry: EntryState): void => {
    // Re-insert to move to tail (Map preserves insertion order).
    states.delete(key);
    states.set(key, entry);
    if (states.size > maxKeys) {
      // Evict oldest (head of insertion order).
      const oldest = states.keys().next().value;
      if (oldest !== undefined) states.delete(oldest);
    }
  };

  const checkBlocked = (key: string, nowMs: number): LimitResult | null => {
    const blk = blocks.get(key);
    if (blk === undefined) return null;
    if (nowMs >= blk.untilMs) {
      blocks.delete(key);
      return null;
    }
    const lim = limitOf(algorithm);
    return { success: false, limit: lim, remaining: 0, resetAt: blk.untilMs };
  };

  return {
    name: "memory",

    async limit(key, points = 1): Promise<LimitResult> {
      const nowMs = Date.now();
      const blocked = checkBlocked(key, nowMs);
      if (blocked !== null) return blocked;

      switch (algorithm.kind) {
        case "slidingWindow":
          return slidingWindowLimit(states, key, nowMs, algorithm.windowMs, algorithm.tokens, points, touchLru);
        case "tokenBucket":
          return tokenBucketLimit(states, key, nowMs, algorithm.refillRate, algorithm.capacity, points, touchLru);
        case "fixedWindow":
          return fixedWindowLimit(states, key, nowMs, algorithm.windowMs, algorithm.tokens, points, touchLru);
      }
    },

    async get(key): Promise<LimitResult> {
      const nowMs = Date.now();
      const blocked = checkBlocked(key, nowMs);
      if (blocked !== null) return blocked;
      // Non-mutating peek: compute current weighted/remaining without incrementing.
      switch (algorithm.kind) {
        case "slidingWindow":
          return slidingWindowGet(states, key, nowMs, algorithm.windowMs, algorithm.tokens);
        case "tokenBucket":
          return tokenBucketGet(states, key, nowMs, algorithm.refillRate, algorithm.capacity);
        case "fixedWindow":
          return fixedWindowGet(states, key, nowMs, algorithm.windowMs, algorithm.tokens);
      }
    },

    async delete(key): Promise<void> {
      states.delete(key);
      blocks.delete(key);
    },

    async block(key, secondsToBlock): Promise<void> {
      blocks.set(key, { kind: "blocked", untilMs: Date.now() + secondsToBlock * 1000 });
    },
  };
}

function limitOf(algorithm: AlgorithmConfig): number {
  switch (algorithm.kind) {
    case "slidingWindow":
    case "fixedWindow":
      return algorithm.tokens;
    case "tokenBucket":
      return algorithm.capacity;
  }
}

function slidingWindowLimit(
  states: Map<string, EntryState>,
  key: string,
  nowMs: number,
  windowMs: number,
  maxTokens: number,
  points: number,
  touchLru: (key: string, entry: EntryState) => void,
): LimitResult {
  const currentWindow = Math.floor(nowMs / windowMs);
  let entry = states.get(key);
  if (entry === undefined || entry.kind !== "slidingWindow") {
    entry = { kind: "slidingWindow", windows: new Map(), lastTouchedMs: nowMs };
  }
  const currentCount = entry.windows.get(currentWindow) ?? 0;
  const previousCount = entry.windows.get(currentWindow - 1) ?? 0;
  const elapsedInWindow = nowMs % windowMs;
  const previousWeight = (windowMs - elapsedInWindow) / windowMs;
  const weighted = Math.floor(previousCount * previousWeight + currentCount);
  const resetAt = (currentWindow + 1) * windowMs;

  if (weighted + points > maxTokens) {
    return { success: false, limit: maxTokens, remaining: Math.max(0, maxTokens - weighted), resetAt };
  }
  entry.windows.set(currentWindow, currentCount + points);
  // GC old windows
  for (const w of entry.windows.keys()) {
    if (w < currentWindow - 1) entry.windows.delete(w);
  }
  entry.lastTouchedMs = nowMs;
  touchLru(key, entry);
  const newWeighted = weighted + points;
  return { success: true, limit: maxTokens, remaining: Math.max(0, maxTokens - newWeighted), resetAt };
}

function slidingWindowGet(
  states: Map<string, EntryState>,
  key: string,
  nowMs: number,
  windowMs: number,
  maxTokens: number,
): LimitResult {
  const currentWindow = Math.floor(nowMs / windowMs);
  const entry = states.get(key);
  const resetAt = (currentWindow + 1) * windowMs;
  if (entry === undefined || entry.kind !== "slidingWindow") {
    return { success: true, limit: maxTokens, remaining: maxTokens, resetAt };
  }
  const currentCount = entry.windows.get(currentWindow) ?? 0;
  const previousCount = entry.windows.get(currentWindow - 1) ?? 0;
  const elapsedInWindow = nowMs % windowMs;
  const previousWeight = (windowMs - elapsedInWindow) / windowMs;
  const weighted = Math.floor(previousCount * previousWeight + currentCount);
  return { success: weighted < maxTokens, limit: maxTokens, remaining: Math.max(0, maxTokens - weighted), resetAt };
}

function tokenBucketLimit(
  states: Map<string, EntryState>,
  key: string,
  nowMs: number,
  refillRate: number,
  capacity: number,
  points: number,
  touchLru: (key: string, entry: EntryState) => void,
): LimitResult {
  let entry = states.get(key);
  if (entry === undefined || entry.kind !== "tokenBucket") {
    entry = { kind: "tokenBucket", tokens: capacity, lastRefillMs: nowMs };
  }
  const elapsedSec = (nowMs - entry.lastRefillMs) / 1000;
  const refilled = Math.min(capacity, entry.tokens + elapsedSec * refillRate);
  entry.tokens = refilled;
  entry.lastRefillMs = nowMs;
  if (refilled < points) {
    const needTokens = points - refilled;
    const waitMs = Math.ceil((needTokens / refillRate) * 1000);
    touchLru(key, entry);
    return { success: false, limit: capacity, remaining: Math.floor(refilled), resetAt: nowMs + waitMs };
  }
  entry.tokens = refilled - points;
  touchLru(key, entry);
  return { success: true, limit: capacity, remaining: Math.floor(entry.tokens), resetAt: nowMs };
}

function tokenBucketGet(
  states: Map<string, EntryState>,
  key: string,
  nowMs: number,
  refillRate: number,
  capacity: number,
): LimitResult {
  const entry = states.get(key);
  if (entry === undefined || entry.kind !== "tokenBucket") {
    return { success: true, limit: capacity, remaining: capacity, resetAt: nowMs };
  }
  const elapsedSec = (nowMs - entry.lastRefillMs) / 1000;
  const refilled = Math.min(capacity, entry.tokens + elapsedSec * refillRate);
  return { success: refilled >= 1, limit: capacity, remaining: Math.floor(refilled), resetAt: nowMs };
}

function fixedWindowLimit(
  states: Map<string, EntryState>,
  key: string,
  nowMs: number,
  windowMs: number,
  maxTokens: number,
  points: number,
  touchLru: (key: string, entry: EntryState) => void,
): LimitResult {
  const currentWindow = Math.floor(nowMs / windowMs);
  let entry = states.get(key);
  if (entry === undefined || entry.kind !== "fixedWindow" || entry.windowIndex !== currentWindow) {
    entry = { kind: "fixedWindow", windowIndex: currentWindow, count: 0 };
  }
  const resetAt = (currentWindow + 1) * windowMs;
  if (entry.count + points > maxTokens) {
    return { success: false, limit: maxTokens, remaining: Math.max(0, maxTokens - entry.count), resetAt };
  }
  entry.count += points;
  touchLru(key, entry);
  return { success: true, limit: maxTokens, remaining: Math.max(0, maxTokens - entry.count), resetAt };
}

function fixedWindowGet(
  states: Map<string, EntryState>,
  key: string,
  nowMs: number,
  windowMs: number,
  maxTokens: number,
): LimitResult {
  const currentWindow = Math.floor(nowMs / windowMs);
  const entry = states.get(key);
  const resetAt = (currentWindow + 1) * windowMs;
  if (entry === undefined || entry.kind !== "fixedWindow" || entry.windowIndex !== currentWindow) {
    return { success: true, limit: maxTokens, remaining: maxTokens, resetAt };
  }
  return {
    success: entry.count < maxTokens,
    limit: maxTokens,
    remaining: Math.max(0, maxTokens - entry.count),
    resetAt,
  };
}
