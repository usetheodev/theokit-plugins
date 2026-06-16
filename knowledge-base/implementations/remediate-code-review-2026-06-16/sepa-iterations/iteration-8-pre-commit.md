# SEPA pre-COMMIT — iter 8 — T2.3 (#208/#201) — VERDICT: CLEAN
- dispatch -> uniform AggregateError (all handler errors); console.error-subsequent DELETED.
- WebhookResult.error narrowed unknown -> {code,message} sanitized; full error logged via redactSecrets (whsec_/sk_*/user:pass@).
- 5 existing tests evolved (contract change per D4/D5), not weakened; new redaction-log test. 54/54 payments green; tsc 40; idempotency-store untouched; T2.2 ordering intact.
- changeset payments-webhook-error-shape.md (minor BREAKING). No CRITICAL.
