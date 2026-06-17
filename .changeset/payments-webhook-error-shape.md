---
"@theokit/plugin-payments": minor
---

**BREAKING (pre-1.0):** `WebhookResult`'s `handler_error` variant now carries a sanitized `error: { code: string; message: string }` instead of the raw thrown error (`error: unknown`). This prevents handler errors — which may contain PII/secrets (DB DSNs, API keys) — from leaking to the HTTP layer (#201). The full error is logged server-side with known secret shapes redacted. Additionally, `WebhookRegistry.dispatch` now throws a single `AggregateError` carrying every failed handler's error instead of only the first (#208). Consumers reading `result.error` must switch from the raw error to `result.error.code` / `result.error.message`; consumers calling `registry.dispatch` directly should expect `AggregateError`.
