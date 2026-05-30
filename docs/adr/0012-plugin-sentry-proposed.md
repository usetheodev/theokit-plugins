# 0012. `@theokit/plugin-sentry` — error tracking bridge

- Status: proposed
- Date: 2026-05-27
- Target implementation start: ≤ 2 weeks after `@theokit/plugin-cors@0.1.0` npm release
- Target ship: 2026-Q3

## Context

[ADR-0011 (TheoKit core)](https://github.com/usetheodev/theokit/blob/main/docs/adr/0011-moderate-plugin-roadmap-strategy.md) D4 commits to shipping `@theokit/plugin-sentry` as the second first-party plugin (after CORS). This stub ADR registers the commitment + target dates and captures open questions to be resolved when work starts.

This ADR is intentionally **light** — it documents WHAT we'll build and WHEN, not HOW. A full implementation ADR (D1..DN with rationale + consequences) will replace this file when the implementation PR opens.

## Decision (to be drafted at implementation time)

A plugin that bridges TheoKit's error path to [Sentry](https://sentry.io):

- Captures unhandled errors via `onError` hook
- Attaches request context (URL, method, user agent, request ID) via `onRequest`
- Configurable via `theo.config.ts > plugins: [sentry({ dsn, environment, ... })]`
- Sentry Node SDK as optional peer-dep (not bundled)

## Open questions (to resolve at implementation time)

1. **Which Sentry SDK?** `@sentry/node` is the obvious choice; `@sentry/browser` doesn't fit (TheoPlugin is server-only). Confirm at implementation start.
2. **Source maps integration.** Sentry's source maps require upload at build time. Does `theokit build` need a hook for source-map upload? Or is this a user-side build-step concern?
3. **Sample rate config.** Pass-through to Sentry's `tracesSampleRate`, or wrap with a TheoKit-typed config? Pass-through is simpler.
4. **Performance tracing.** Sentry supports performance traces (spans). Does the plugin add a TheoKit-side wrapper around route handlers, or rely on Sentry's auto-instrumentation? Auto-instrumentation likely covers Node's http module.
5. **Privacy / PII scrubbing.** Default config should redact common PII (Authorization headers, cookies). What's the redaction surface?
6. **OpenTelemetry overlap.** A future `@theokit/plugin-otel` (demand-gated) might overlap. Should sentry plugin emit via OTel SDK and let users wire Sentry's OTel collector? Or use Sentry SDK directly? Decision pending OTel demand signal.

## Status notes

This ADR is **intentionally light** — full structure (Context, Decision, Considered alternatives, Consequences with `**Rationale:**` + `**Consequences:**` per decision) lands with the implementation PR. Until then, the open questions above represent the design surface to resolve.

## Related ADRs

- [ADR-0011 (TheoKit core)](https://github.com/usetheodev/theokit/blob/main/docs/adr/0011-moderate-plugin-roadmap-strategy.md) — moderate plugin roadmap; commits to this plugin with temporal gate (≤ 2 weeks)
- [ADR-0008 (TheoKit core)](https://github.com/usetheodev/theokit/blob/main/docs/adr/0008-theoplugin-is-the-canonical-sdk.md) — `TheoPlugin` is the SDK this plugin uses
- ADR-0013 (sibling) — `@theokit/plugin-i18n` (proposed)

## References

- Sentry Node SDK — https://docs.sentry.io/platforms/node/
- TheoKit roadmap entry — [`ROADMAP.md`](../../ROADMAP.md) → Committed table
