# @theokit/plugin-rate-limit

## [Unreleased]

## [0.1.0] - 2026-06-04 (initial; unpublished — gated on @theokit/sdk@1.7.0 + @theokit/plugin-realtime@0.1.0 @next promote cohort)

Per plan [`p10-plugin-rate-limit-plan.md`](../../../.claude/knowledge-base/plans/p10-plugin-rate-limit-plan.md) v1.0 and blueprint [`p10-plugin-rate-limit-blueprint.md`](../../../.claude/knowledge-base/discoveries/blueprints/p10-plugin-rate-limit-blueprint.md) v1.0 (SHIPPABLE 99.2/100). Form 4 Hybrid: `RateLimitProvider` interface + `MemoryRateLimitProvider` default + `RedisRateLimitProvider` opt-in (ioredis ^5 peer + Lua atomicity) + `defineRateLimitProvider` extension + `defineRateLimit({transports, identify, limits})` unified middleware + `withRateLimit(mountSubscriptions, opts)` G8/P#9 wrapper. Mitigates P#9 EC-6 directly.

### Added

- **`RateLimitProvider`** interface — `{name, limit, get, delete, block}` (D2).
- **Algorithms** (per ADR D1) — `slidingWindow(tokens, windowMs)` default + `tokenBucket(refillRate, capacity)` + `fixedWindow(tokens, windowMs)` factory constants.
- **`createMemoryRateLimitProvider({algorithm, maxKeys?})`** — zero-dep in-process default; LRU eviction (default 10000 keys cap per blueprint EC-7 DoS mitigation).
- **`createRedisRateLimitProvider({redis, algorithm})`** — ioredis ^5 optional peer; Lua-script atomicity for all 3 algorithms (single Redis round-trip per check); throws `RateLimitProviderError({code:'redis_eval_failed'})` on backend failure.
- **`loadIoredisOrThrow()`** — dynamic-import helper for consumers wanting lazy-loaded ioredis; throws actionable `RateLimitProviderError({code:'ioredis_peer_missing'})`.
- **`defineRateLimitProvider(impl)`** — type-asserting helper for consumer-supplied adapters (Upstash REST / CF DO / Redis cluster).
- **`defineRateLimit({transports, identify, limits, keyPrefix, provider})`** — unified HTTP+WS middleware factory (per ADR D3). Returns `RateLimitHandler.check(ctx, routeName)` usable in any theokit route OR G8 upgrade listener.
- **`withRateLimit(mounted, {limiter, routeName, onLimited?})`** — wraps G8 `MountedSubscriptions` OR P#9 `MountedRealtime` with pre-dispatch rate-limit check at upgrade boundary (per ADR D5). 429 + Retry-After header on HTTP; socket destroy on WS.
- **`RateLimitRuntime`** internal orchestrator — composes provider + identify + keyPrefix; warns at runtime if `keyPrefix` absent (per ADR D7 multi-tenant safety).
- **4 typed Lua scripts** — `LUA_SLIDING_WINDOW` / `LUA_FIXED_WINDOW` / `LUA_TOKEN_BUCKET` / `LUA_BLOCK` exported as string constants for inspection + custom EVAL.
- **3 typed error classes** — `RateLimitError` (base) + `RateLimitProviderError` (Redis/backend failure) + `RateLimitConfigError` (invalid config).

### Notes

- **`ioredis ^5` optional peer** via `peerDependenciesMeta`. SSE-only / Memory-only consumers pay zero. Dynamic `import('ioredis')` only on `loadIoredisOrThrow()` call (factory accepts pre-built client).
- **Atomic Lua REQUIRED** (ADR D4) — without single-round-trip Redis EVAL, race conditions under burst allow rate-limit bypass. Scripts adapted from upstash-ratelimit canonical (`references/upstash-ratelimit/src/lua-scripts/`).
- **`keyPrefix` REQUIRED** (ADR D7) — multi-tenant Redis safety. Warns at runtime if absent + uses fallback `'@theokit/rate-limit'`.
- **Limit result shape** — `{success, limit, remaining, resetAt}` (Upstash pattern; never throws on rate-limit reject) per ADR D6 DX choice.
- **Identify callback** — receives request context (HTTP req OR G8 SubscriptionCtx); defaults to extracting X-Forwarded-For first hop or `req.socket.remoteAddress`. Consumer responsible for trusting XFF only behind a trusted proxy.

### Out of scope v0.1 (deferred to v0.x)

- **CF Workers / Bun / Deno adapter packages** (per ADR D8).
- **@upstash/redis REST adapter** — consumer-supplied via `defineRateLimitProvider` works today; native package v0.x.
- **Redis Cluster mode** — single-node default; cluster requires centralized time source per blueprint EC-5.
- **Auto-apply via theokit/server scanner** — consumer wires per-route by design (D3).
- **dogfood-app smoke** — post-implementation session.
- **npm publish** — calendar-gated ~2026-07-15+ aligned with G8 sdk@1.7.0 + P#9 plugin-realtime promote cohort.

### Security threats addressed

| Threat | Mitigation |
|---|---|
| Header spoofing (X-Forwarded-For) | `identify` callback consumer responsibility; README warns |
| Multi-tenant key collision | REQUIRED `keyPrefix` config; warns if absent (ADR D7) |
| DoS-via-rate-limit-store | Memory provider `maxKeys` cap (default 10000) + LRU; Redis adapter TTL via PEXPIRE |
| Clock skew Redis cluster | Document single-node default; cluster requires Upstash REST |
| Lua atomicity bypass | EVAL single round-trip (ADR D4) — no multi-step INCR+EXPIRE |
| Block-list amplification | Block duration consumer-tunable |

### Quality gates

- **55 GREEN + 3 honest-SKIP tests** across 9 test files (Redis env-gated via REDIS_URL; honest SKIP without — per real-llm-validation.md adapted to infra).
- `npx tsc --noEmit`: exit 0.
- `npx tsup`: `dist/index.js` 21.94 KB + `dist/index.d.ts` 15.32 KB + sourcemap.
- `npm pack --dry-run`: 21.4 KB tarball / 5 files (zero test-file leak).
- Zero stubs / Mock / Stub / Fake exports in src/ (per `no-stubs-no-mocks-no-wired.md`).

### Deferred (calendar-gated ~2026-07-15+)

- **dogfood-app smoke test** — wire `withRateLimit(mountRealtime, {limiter, routeName: 'realtime:canvas'})` for cursors-in-canvas demo.
- **npm publish** via `pnpm publish --tag next --access public`.
- **Real Redis CI smoke** — `REDIS_URL` env-gated workflow with docker redis service.
