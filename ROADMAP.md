# Roadmap — theokit-plugins

> Strategy: **moderate** — 3 plugins committed, 6 demand-gated. See [ADR-0011 in TheoKit core](https://github.com/usetheodev/theokit/blob/main/docs/adr/0011-moderate-plugin-roadmap-strategy.md) for the rationale + temporal gates.

## Committed (will ship)

| Plugin                   | Status               | Target                                           | ADR                                                                                                           |
| ------------------------ | -------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| `@usetheo/plugin-cors`   | ✅ Shipping (v0.1.0) | 2026-Q3                                          | [ADR-0011](https://github.com/usetheodev/theokit/blob/main/docs/adr/0011-moderate-plugin-roadmap-strategy.md) |
| `@usetheo/plugin-sentry` | 🟡 Proposed          | Start ≤ 2 weeks after cors release; ship 2026-Q3 | [ADR-0012](./docs/adr/0012-plugin-sentry-proposed.md)                                                         |
| `@usetheo/plugin-i18n`   | 🟡 Proposed          | Start ≤ 6 weeks after cors release; ship 2026-Q4 | [ADR-0013](./docs/adr/0013-plugin-i18n-proposed.md)                                                           |

Temporal gates from ADR-0011 D4 — slipping these triggers an explicit follow-up ADR (downgrade "moderate" → "conservative" OR explain the delay).

## Demand-gated (won't ship until evidence)

Gates per plugin (ALL must hold):

1. 1+ app in production using a draft/community version
2. 3+ requests in GitHub discussions
3. Doesn't duplicate a TheoKit core primitive (see [exclusions table below](#exclusions-already-in-core))
4. Maintainable: <100 LOC OR <1 week of maintenance per year
5. Tests + fixture project

| Plugin                                         | Demand evidence today | Why considered (eventually)                                                                                      |
| ---------------------------------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `@usetheo/plugin-otel`                         | 0 apps / 0 requests   | TheoKit has trace context (`x-trace-id` propagation) but no OpenTelemetry exporter — bridge would close that gap |
| `@usetheo/plugin-resend`                       | 0 / 0                 | Common SaaS need (transactional email); SDK wrapping pattern                                                     |
| `@usetheo/plugin-stripe-webhooks`              | 0 / 0                 | Sugar over `defineWebhook` adding Stripe signature verification ergonomics                                       |
| `@usetheo/plugin-clerk` / `-auth0` / `-workos` | 0 / 0 (each)          | Hosted auth bridges; TheoKit ships session + RFC primitives, not vendor bridges                                  |
| `@usetheo/plugin-feature-flags`                | 0 / 0                 | GrowthBook / LaunchDarkly / Posthog bridges                                                                      |
| `@usetheo/plugin-inngest` / `-trigger-dev`     | 0 / 0                 | Workflow engine bridges; TheoKit has `defineJob` + outbox, not workflow orchestration                            |

## Exclusions — already in core (don't propose these as plugins)

| Need                                  | Already in TheoKit                            |
| ------------------------------------- | --------------------------------------------- |
| Security headers (CSP/HSTS/X-Frame)   | Built-in via security-hardening defaults      |
| Cookies                               | `getCookie` / `setCookie` / `deleteCookie`    |
| Rate limit                            | `createRateLimiter` + pluggable store         |
| Multipart upload                      | `parseRequestBody` + busboy                   |
| Postgres / Redis                      | `usePostgres` / `useRedis` + `StorageManager` |
| KV (Redis/S3/CF KV/Vercel KV)         | `useUnstorage` (20+ unstorage drivers)        |
| SQL non-PG (libSQL/D1/MySQL/SQLite)   | `useDatabase` (db0 connectors)                |
| Custom client (Mongo/DynamoDB)        | `useStorage<T>` generic                       |
| WebSocket                             | `defineWebSocket`                             |
| Cron                                  | `defineCron`                                  |
| Webhooks (generic)                    | `defineWebhook`                               |
| OpenAPI generation                    | Auto from `defineRoute` + Zod                 |
| Auth (PKCE/OAuth state/TOTP/sessions) | RFC-aligned primitives in core                |

## TheoKit compatibility matrix

Per ADR-0011 D5 + edge-case EC-13, every plugin declares an explicit TheoKit peer-dep range. When TheoKit ships a major bump, each plugin updates its range via a Changeset PR (range broadening is NOT automatic — security default).

| Plugin version               | TheoKit range tested | Notes                                     |
| ---------------------------- | -------------------- | ----------------------------------------- |
| `@usetheo/plugin-cors@0.1.x` | `>=0.1.0-alpha.5`    | Initial; aligned to current TheoKit alpha |

When `@usetheo/plugin-sentry` and `@usetheo/plugin-i18n` ship, they extend this table with their own row.

## How to propose a new plugin

For first-party (under `@usetheo/plugin-*` scope):

1. Open a discussion at https://github.com/usetheodev/theokit/discussions titled `[plugin proposal] <name>`
2. Show: real production use case, 3+ requests from others, why it can't be a core primitive
3. If accepted by a maintainer, a package skeleton lands in this repo's `packages/`

For community (under `@<your-scope>/theokit-plugin-*`):

1. Publish wherever — no permission needed
2. Add the `theokit-plugin` keyword in your `package.json`
3. (Optional, later) Apply for inclusion in a "community plugins" page once 5+ community plugins exist

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the full process.

## Status legend

- ✅ Shipping — published to npm, accepting PRs
- 🟡 Proposed — ADR drafted with `proposed` status; implementation pending
- ⏳ Demand-gated — won't enter Committed until gates clear
