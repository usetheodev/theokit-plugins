# @theokit/plugin-rate-limit

> Rate-limit plugin for TheoKit — sliding-window / token-bucket / fixed-window algorithms; Memory default + Redis (ioredis) adapter; unified HTTP+WS middleware; `withRateLimit` wrapper for G8 subscriptions + P#9 realtime. Per plan `p10-plugin-rate-limit` v1.0.

Mitigates P#9 presence flooding (EC-6) at the upgrade boundary; protects HTTP routes; supports per-IP / per-userId / per-route key strategies.

## Install

```bash
pnpm add @theokit/plugin-rate-limit theokit
# Optional Redis peer (only if using SlidingWindowRedisProvider):
pnpm add ioredis
```

## Quick start — Memory provider

```ts
import {
  createMemoryRateLimitProvider,
  defineRateLimit,
  slidingWindow,
} from "@theokit/plugin-rate-limit";

const limiter = defineRateLimit({
  transports: ["http"],
  keyPrefix: "myapp",
  identify: (ctx) => (ctx as { ip: string }).ip,
  provider: createMemoryRateLimitProvider({
    algorithm: slidingWindow(60, 60_000), // 60 req/min
  }),
});

// HTTP route handler
app.post("/api/messages", async (req, res) => {
  const result = await limiter.check(req, "POST /api/messages");
  if (!result.success) {
    return res.status(429).json({ retryAfter: result.resetAt });
  }
  // ... handle request
});
```

## Redis adapter (production cluster path)

```ts
import { Redis } from "ioredis";
import {
  createRedisRateLimitProvider,
  defineRateLimit,
  slidingWindow,
} from "@theokit/plugin-rate-limit";

const redis = new Redis(process.env.REDIS_URL);

const limiter = defineRateLimit({
  transports: ["http", "ws"],
  keyPrefix: "myapp",
  identify: (ctx) => (ctx as { userId: string }).userId,
  provider: createRedisRateLimitProvider({
    redis,
    algorithm: slidingWindow(100, 60_000),
  }),
});
```

Atomic guarantees via Redis Lua EVAL (single round-trip per check). Per ADR D4 — without Lua atomicity, concurrent requests would silently bypass the limit.

## G8 subscription + P#9 realtime integration

```ts
import { mountRealtime } from "@theokit/plugin-realtime";
import { withRateLimit } from "@theokit/plugin-rate-limit";

const mounted = mountRealtime({ runtime, rooms: [cursorRoom] });

const limited = withRateLimit(mounted, {
  limiter, // defineRateLimit-produced handler
  routeName: "realtime:cursor",
});

server.on("upgrade", limited.handleWsUpgrade); // rate-limited before WS upgrade
```

Mitigates P#9 EC-6 (presence flooding) at the upgrade boundary BEFORE the subscription handler dispatches. 429 + Retry-After header on reject.

## Algorithm comparison

| Algorithm | Memory cost | Accuracy | Use case |
|---|---|---|---|
| `slidingWindow` (default) | medium (2 windows per key) | good | canonical web/API rate-limit |
| `tokenBucket` | medium (refill timer per key) | excellent | burst-friendly API |
| `fixedWindow` | low (1 counter per window) | poor (2x burst at boundary) | low-traffic dev |

## Custom provider (Upstash REST / CF DO / etc)

```ts
import { defineRateLimitProvider } from "@theokit/plugin-rate-limit";

export const UpstashProvider = defineRateLimitProvider({
  name: "upstash",
  async limit(key, points = 1) { /* call @upstash/redis REST */ return {...}; },
  async get(key) { /* peek */ return {...}; },
  async delete(key) { /* DEL */ },
  async block(key, secondsToBlock) { /* SETEX */ },
});
```

## Security threats addressed

| Threat | Mitigation |
|---|---|
| Header spoofing (X-Forwarded-For) | `identify` callback is consumer responsibility; README warns + recipe with `req.socket.remoteAddress` fallback when no-trust-proxy |
| Multi-tenant key collision | REQUIRED `keyPrefix` config; warns on stderr if absent (per ADR D7) |
| DoS-via-rate-limit-store | Memory provider: `maxKeys` cap (default 10000) + LRU eviction; Redis: TTL enforcement via Lua PEXPIRE |
| Clock skew Redis cluster | Document single-node default; cluster mode requires centralized time source (Upstash REST) |
| Lua atomicity bypass | EVAL single round-trip enforced per ADR D4 (no multi-step INCR+EXPIRE) |
| Block-list amplification | Block duration is consumer-tunable; no internal cap |

## Multi-runtime compatibility (v0.1)

| Runtime | v0.1 | v0.x (planned) |
|---|---|---|
| Node 22+ | yes (canonical Memory + Redis via ioredis) | yes |
| Cloudflare Workers | consumer-supplied adapter via `defineRateLimitProvider` | yes (`@theokit/plugin-rate-limit-cloudflare` w/ DO storage) |
| Bun | consumer adapter | yes |
| Deno | consumer adapter | yes |

## License

MIT
