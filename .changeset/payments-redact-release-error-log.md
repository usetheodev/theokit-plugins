---
"@theokit/plugin-payments": patch
---

Redact secrets in the idempotency-claim release-failure log (review finding F-dom-pay-5). When a webhook handler throws, `processWebhook` best-effort releases the idempotency claim; if that `release()` itself throws, the error was previously logged raw, so a `release()` failure carrying credentials (e.g. a DB connection string) could leak into the server log. The error is now passed through `redactSecrets()` before logging, matching the handler-error log path. No public API change.
