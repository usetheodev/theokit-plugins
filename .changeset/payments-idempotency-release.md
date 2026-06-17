---
"@theokit/plugin-payments": minor
---

**BREAKING (pre-1.0):** `IdempotencyStore` now requires a `release(eventId)` method, and `IdempotencyRepository` now requires `delete(eventId)`. This makes the webhook dispatcher exactly-once on success AND retry-on-failure (#167): an event is claimed before dispatch and released if the handler throws, so Stripe's retry re-runs it instead of silently deduping a failed delivery. Consumers providing a custom `IdempotencyStore`/`IdempotencyRepository` must implement the new method(s). Webhook handlers must be idempotent (multi-handler partial failure re-runs succeeded handlers on retry).
