/**
 * @theokit/plugin-rate-limit — Lua scripts as TS string constants (P#10).
 *
 * Per ADR D4 — atomic Redis EVAL REQUIRED for rate-limit correctness.
 * Without atomicity, concurrent requests bypass limit silently.
 *
 * Scripts adapted from upstash-ratelimit's canonical implementations:
 * `references/upstash-ratelimit/src/lua-scripts/single/`.
 *
 * KEYS[1] = full key (e.g., "myapp:rate-limit:user-123")
 * ARGV[1..N] = algorithm-specific params (window/tokens/now/...)
 *
 * Returns: number array [success, remaining, resetAt] OR [success, remaining, resetAt, retryAfterMs]
 *
 * @internal
 */

/**
 * Sliding-window weighted-average algorithm.
 * ARGV[1] = nowMs, ARGV[2] = windowMs, ARGV[3] = maxTokens, ARGV[4] = pointsToConsume
 *
 * Algorithm:
 * - currentWindow = floor(nowMs / windowMs)
 * - currentCount = GET key:current
 * - previousCount = GET key:previous
 * - weighted = previousCount * ((windowMs - (nowMs % windowMs)) / windowMs) + currentCount
 * - if weighted + pointsToConsume > maxTokens → reject
 * - else INCRBY key:current pointsToConsume + EXPIRE 2*windowMs
 */
export const LUA_SLIDING_WINDOW = `
local key       = KEYS[1]
local nowMs     = tonumber(ARGV[1])
local windowMs  = tonumber(ARGV[2])
local maxTokens = tonumber(ARGV[3])
local points    = tonumber(ARGV[4])

local currentWindow = math.floor(nowMs / windowMs)
local currentKey  = key .. ":" .. currentWindow
local previousKey = key .. ":" .. (currentWindow - 1)

local currentCount = tonumber(redis.call("GET", currentKey) or "0")
local previousCount = tonumber(redis.call("GET", previousKey) or "0")

local elapsedInWindow = nowMs % windowMs
local previousWeight = (windowMs - elapsedInWindow) / windowMs
local weighted = math.floor(previousCount * previousWeight + currentCount)

local resetAt = (currentWindow + 1) * windowMs

if weighted + points > maxTokens then
  return { 0, math.max(0, maxTokens - weighted), resetAt }
end

redis.call("INCRBY", currentKey, points)
redis.call("PEXPIRE", currentKey, windowMs * 2)

local newWeighted = weighted + points
return { 1, math.max(0, maxTokens - newWeighted), resetAt }
`.trim();

/**
 * Fixed-window: per-window counter with PEXPIRE.
 * ARGV[1] = nowMs, ARGV[2] = windowMs, ARGV[3] = maxTokens, ARGV[4] = pointsToConsume
 */
export const LUA_FIXED_WINDOW = `
local key       = KEYS[1]
local nowMs     = tonumber(ARGV[1])
local windowMs  = tonumber(ARGV[2])
local maxTokens = tonumber(ARGV[3])
local points    = tonumber(ARGV[4])

local currentWindow = math.floor(nowMs / windowMs)
local windowKey = key .. ":" .. currentWindow
local resetAt = (currentWindow + 1) * windowMs

local count = tonumber(redis.call("GET", windowKey) or "0")
if count + points > maxTokens then
  return { 0, math.max(0, maxTokens - count), resetAt }
end

local newCount = redis.call("INCRBY", windowKey, points)
redis.call("PEXPIRE", windowKey, windowMs)
return { 1, math.max(0, maxTokens - newCount), resetAt }
`.trim();

/**
 * Token-bucket: refill `refillRatePerSec` tokens per second up to `capacity`.
 * ARGV[1] = nowMs, ARGV[2] = refillRatePerSec, ARGV[3] = capacity, ARGV[4] = pointsToConsume
 *
 * State stored as 2 fields: tokens (float as string) + lastRefillMs (int)
 */
export const LUA_TOKEN_BUCKET = `
local key      = KEYS[1]
local nowMs    = tonumber(ARGV[1])
local rate     = tonumber(ARGV[2])
local capacity = tonumber(ARGV[3])
local points   = tonumber(ARGV[4])

local data = redis.call("HMGET", key, "tokens", "lastRefillMs")
local tokens = tonumber(data[1])
local lastRefillMs = tonumber(data[2])

if tokens == nil then
  tokens = capacity
  lastRefillMs = nowMs
else
  local elapsedSec = (nowMs - lastRefillMs) / 1000
  tokens = math.min(capacity, tokens + elapsedSec * rate)
  lastRefillMs = nowMs
end

if tokens < points then
  local needTokens = points - tokens
  local waitMs = math.ceil((needTokens / rate) * 1000)
  redis.call("HMSET", key, "tokens", tokens, "lastRefillMs", lastRefillMs)
  redis.call("PEXPIRE", key, math.ceil((capacity / rate) * 1000))
  return { 0, math.floor(tokens), nowMs + waitMs }
end

tokens = tokens - points
redis.call("HMSET", key, "tokens", tokens, "lastRefillMs", lastRefillMs)
redis.call("PEXPIRE", key, math.ceil((capacity / rate) * 1000))
return { 1, math.floor(tokens), nowMs }
`.trim();

/**
 * Block script — set a `:blocked` marker with TTL.
 * ARGV[1] = secondsToBlock
 */
export const LUA_BLOCK = `
local key = KEYS[1]
local secondsToBlock = tonumber(ARGV[1])
redis.call("SET", key .. ":blocked", "1", "EX", secondsToBlock)
return 1
`.trim();
