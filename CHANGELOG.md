# Changelog

Workspace-level changes for the `theokit-plugins` monorepo. Per-package changes live in each `packages/plugin-*/CHANGELOG.md` (auto-managed by Changesets).

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this repo adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Code review audit (2026-06-16) of all 11 `@theokit/*` packages — 72 findings (1 critical, 26 high, 34 medium, 11 low) in `code-review-output/final_report.md`
- Remediation plan for all 72 findings — `knowledge-base/plans/remediate-code-review-2026-06-16-plan.md` (verdict SHIPPABLE 96.8) + edge-case review

### Removed

- Stale prior-run review artifacts from `code-review-output/` (2026-06-11 phase reports + figures superseded by the 2026-06-16 audit)

## [0.1.0] - 2026-06-11

### Added

- Code review report covering all 11 packages — 166 findings across 182 files (`code-review-output/REVIEW-REPORT.md`)
- Implementation plan to remediate all 23 blocking findings (`knowledge-base/plans/fix-code-review-findings-plan.md`)
- DOMPurify-based SVG/HTML sanitization in plugin-canvas, replacing regex-based approach (OWASP recommendation)
- Resend provider test suite (`packages/plugin-email/tests/resend-provider.test.ts`)
- Budget bridge calendar-month test suite (`packages/plugin-copilot/tests/budget-bridge.test.ts`)
- Initial monorepo scaffold — `pnpm-workspace.yaml` + `tsconfig.base.json` + ESLint + Prettier + Changesets + CI workflows

### Changed

- Bump `@theokit/ui` peer dependency to `^0.14.2` in plugin-canvas, plugin-copilot, and plugin-forms
- plugin-copilot: `CopilotAgentConfig.apiKey` now accepts `string | (() => string)` for lazy key resolution
- plugin-payments: `WebhookRegistry.dispatch()` now runs all handlers even when one throws (first error rethrown, subsequent logged)
- plugin-voice README updated to reflect v0.7.0 capabilities; removed false auto-endpoint claim
- plugin-realtime README documents `useBroadcast`/`updateMyPresence` as local-only in v0.1

### Fixed

- plugin-canvas: SQL injection via unvalidated table name in `createSqliteArtifactStore` — now validated against `/^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/`
- plugin-canvas: SVG sanitizer bypass vectors (foreignObject, CSS expression, case-mixed javascript: URIs, external xlink:href)
- plugin-canvas: 500 error responses no longer leak internal error messages
- plugin-canvas: `onAfterInsert` side-effect errors now logged instead of silently swallowed
- plugin-canvas: invalid `kind` query param now returns 400 instead of unchecked type assertion
- plugin-copilot: race condition in `CopilotRuntime.handleFrame` — concurrent calls now serialized per-registration
- plugin-copilot: `deactivate()` now drains pending frame queue before leaving room
- plugin-copilot: `BudgetBridge` uses calendar month boundaries instead of fixed 30-day window
- plugin-copilot: agent errors in `runAgent` now propagated to callers after broadcast
- plugin-db-drizzle: devtools iframe now sandboxed (`allow-scripts allow-same-origin`)
- plugin-email: `ResendProvider.send` preserves error cause chain from Resend API
- plugin-forms: non-`ActionInputError` exceptions in `TheoForm` `onSuccess` now rethrown
- plugin-payments: webhook handler errors no longer block subsequent handlers
- plugin-realtime: listener errors in fanout loops now logged instead of silently swallowed
- plugin-realtime: mermaid and Yjs lazy loaders use single-flight pattern (no concurrent double-init, no permanent error cache)
