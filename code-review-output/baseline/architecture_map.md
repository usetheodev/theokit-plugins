# Architecture Map — theokit-plugins

Monorepo (pnpm workspace) of `@theokit/*` plugins — composable building blocks for
Theo-based apps. Each package is an independent module published under `@theokit/`.

## Product packages (deep-review scope)

```
auth-github ─┐
auth-google ─┼─ OAuth/identity providers (token exchange, CSRF state)
auth-magic-link ┘   └─ token store

plugin-canvas ──── artifact bus + HTML sanitization (DOMPurify)  [XSS surface]
plugin-copilot ─── AI agent room member + bridges (canvas/voice/budget) + trigger-evaluator
plugin-realtime ── yjs CRDT provider + rooms + memory provider     [concurrency]
plugin-voice ───── STT/TTS servers + recorder                      [external I/O, streaming]
plugin-payments ── Stripe checkout + webhook (sig verify) + idempotency + currency  [money]
plugin-email ───── Resend provider + react-email render + magic-link email
plugin-db-drizzle ─ Drizzle integration + CLI migrations
plugin-forms ───── useTheoField + action-error adapter
```

## Repo development harness (sampled — NOT shipped product)

- `.claude/skills/**` — cycle harness (plan/discover/implement/review/code-quality). Python.
- `.claude/hooks/**` — Git/session hooks (stop-validation, public-copy-lint).
- `.claude/scripts/**` — xref + e2e smoke checks.
- `scripts/scope-rename.sh` — repo maintenance.

## Layering (per package, typical)

```
index.ts (public API / composition root)
   ↓
define-*.ts / provider.ts (use-case orchestration)
   ↓
internal/** , server/** (runtime, bridges, IO adapters)
   ↓
types.ts / schema.ts / errors.ts (contracts)
```

## Cross-package dependencies (observed)

- plugin-copilot bridges into plugin-canvas, plugin-voice, plugin-realtime (budget/canvas/voice bridges).
- auth-magic-link ↔ plugin-email (magic-link email rendering).
