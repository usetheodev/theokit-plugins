# Edge Case Review — remediate-code-review-2026-06-16

Date: 2026-06-16
Tasks analyzed: 36 (across 9 phases + Integration Validation)
Edge cases found: 13 (MUST FIX: 4, SHOULD TEST: 6, DOCUMENT: 3)

The plan is strong — every task already carries TDD, and concurrency/failure-scenario coverage is present where applicable. The edges below are the realistic gaps that survive that coverage. None require new abstractions; every fix is an `if`, a `finally`, a test, or a one-line plan note.

## MUST FIX

### EC-1: in-flight Y.Doc promise is never cleared on rejection
- **Affected task:** T4.1
- **Family:** State
- **Scenario:** `state.docInit` memoizes the creation promise. If `loadYjs()` (the awaited import/construction) rejects once (transient ESM load failure, OOM), the rejected promise stays cached. Every subsequent `joinRoom` for that room awaits the same rejected promise → the room is permanently un-joinable until process restart.
- **Impact:** A single transient failure bricks a room forever (worse than the race it replaced).
- **Suggested fix:** in the `catch`, clear the memo before rethrowing: `try { ... } catch (e) { state.docInit = undefined; throw e }`.

### EC-2: budget reservation leaks when an invocation never completes
- **Affected task:** T6.2 / T6.6
- **Family:** Resource
- **Scenario:** D7 reserves estimated cost at preflight and reconciles on completion. If `runAgent` throws or hangs (upstream LLM timeout, cancellation), the reservation is never reconciled/released → reserved budget is consumed forever, eventually blocking all future invocations for that copilot.
- **Impact:** Budget exhaustion from failed (not successful) calls; copilot silently stops working.
- **Suggested fix:** wrap reconciliation in `finally` — release/reconcile the reservation on BOTH success and failure paths (reconcile actual on success, release reservation on throw).

### EC-3: multi-handler partial failure re-runs already-succeeded handlers on retry
- **Affected task:** T2.2 / T2.3
- **Family:** State
- **Scenario:** With mark-after-success (D4) + multiple webhook handlers, if handler A succeeds and handler B throws, the event is NOT marked → Stripe retries → handler A runs **again** (double side-effect) while B retries.
- **Impact:** Non-idempotent handler A double-fulfills (e.g., double email/credit) on every B failure.
- **Suggested fix:** make the contract explicit in ADR D4 + DoD: webhook handlers MUST be individually idempotent (document loudly), OR mark per-(event,handler) instead of per-event. At minimum add the per-handler-idempotency requirement to the plan and a test asserting A is not re-run when only B failed (if per-handler marking is chosen).

### EC-4: breaking changes (D5, D6) have no Changeset task
- **Affected task:** T2.3 (webhook error shape) + T3.1 (magic-link store schema)
- **Family:** Format / Integration
- **Scenario:** The repo versions packages via Changesets (`package.json` `changeset`/`version`/`release`). The plan mentions "changeset" in Drawbacks but no task creates a `.changeset/*.md`. Without it, `@theokit/plugin-payments` and `@theokit/auth-magic-link` ship the public-contract change with a patch bump (or none), and consumers break silently.
- **Impact:** Breaking change released as non-major; downstream apps break on upgrade.
- **Suggested fix:** add a sub-step to T2.3 and T3.1: "create a `.changeset/*.md` with the appropriate semver bump (minor/major) describing the public-contract change."

## SHOULD TEST

### EC-5: currency amount overflow after minor-unit scaling
- **Affected task:** T2.1
- **Suggested test:** `test_formatAmountForStripe_rejects_unsafe_large_amount` — a 2-decimal amount whose `×100` exceeds `Number.MAX_SAFE_INTEGER` (or Stripe's max) is rejected with a clear error, not silently rounded.

### EC-6: malformed base64 in `data:image/svg+xml` must reject, not throw
- **Affected task:** T1.2
- **Suggested test:** `test_enforce_rejects_malformed_svg_data_url` — a truncated/invalid base64 svg+xml artifact yields `CanvasArtifactSecurityError` (clean reject), not an unhandled decode exception that 500s the route.

### EC-7: body cap must count bytes read, not trust Content-Length
- **Affected task:** T3.2
- **Suggested test:** `test_resolve_email_caps_on_actual_bytes` — a chunked request with absent/lying Content-Length but an oversized body is still rejected once accumulated bytes exceed the cap.

### EC-8: `AbortSignal.timeout` availability + single 504 when both timeout and client-abort fire
- **Affected task:** T5.1
- **Suggested test:** `test_stt_timeout_uses_available_abort` (feature-detect/polyfill on runtimes lacking `AbortSignal.timeout`) + `test_stt_double_abort_maps_to_single_504` — client abort and timeout firing together produce exactly one 504, no double-resolution.

### EC-9: server-integration overflow policy must not silently drop ordered yjs frames
- **Affected task:** T4.3
- **Suggested test:** `test_overflow_disconnects_for_ordered_storage` — for `storage:"yjs"`, queue overflow DISCONNECTS (forcing client resync) rather than drop-oldest, since dropping a CRDT update silently diverges state. Assert the policy per storage kind.

### EC-10: complexity extraction must preserve `this`/closure binding
- **Affected task:** T9.1
- **Suggested test:** characterization snapshots BEFORE extraction for `serializeArtifactForCopy`, `createInMemoryArtifactStore`, and the react/index effect — assert byte-identical output / identical observable behavior after the refactor (guards against arrow-vs-method `this` and captured-variable regressions).

## DOCUMENT

### EC-11: mark-after-success is at-least-once if `markProcessed` itself throws post-dispatch
- **Accepted risk:** After a successful dispatch, if `markProcessed` throws (store down), the next retry re-runs handlers. This is the inherent at-least-once tradeoff of D4; acceptable provided EC-3's idempotency requirement is documented. No code change beyond the EC-3 contract note.

### EC-12: unsalted SHA-256 for magic-link tokens is acceptable
- **Accepted risk:** D6 hashes tokens with unsalted SHA-256. This is correct here BECAUSE the tokens are 32-byte high-entropy random values (not low-entropy passwords) — no rainbow-table/brute-force surface, so a salt/KDF is unnecessary. Document the rationale inline so a future reviewer doesn't "fix" it into bcrypt.

### EC-13: `NODE_ENV` may be undefined in some production runtimes
- **Accepted risk:** T2.4's loud guard keys on `NODE_ENV==='production'`. Serverless/edge runtimes sometimes leave `NODE_ENV` unset. The guard then won't fire. Acceptable as a best-effort safety net (the real fix is consumers supplying a store); document that the guard is advisory, not a hard gate.

## Summary

| Task | Edges found | MUST FIX | SHOULD TEST | DOCUMENT |
|------|-------------|----------|-------------|----------|
| T1.2 | 1 | 0 | 1 | 0 |
| T2.1 | 1 | 0 | 1 | 0 |
| T2.2 | 2 | 1 | 0 | 1 |
| T2.3 | 1 (EC-4 shared) | 1 | 0 | 0 |
| T2.4 | 1 | 0 | 0 | 1 |
| T3.1 | 2 | 1 (EC-4 shared) | 0 | 1 |
| T3.2 | 1 | 0 | 1 | 0 |
| T4.1 | 1 | 1 | 0 | 0 |
| T4.3 | 1 | 0 | 1 | 0 |
| T5.1 | 1 | 0 | 1 | 0 |
| T6.2 | 1 | 1 | 0 | 0 |
| T9.1 | 1 | 0 | 1 | 0 |

**Verdict:** PLAN NEEDS ADJUSTMENT — 4 MUST FIX items (EC-1 in-flight rejection clear, EC-2 reservation leak on failure, EC-3 multi-handler idempotency contract, EC-4 Changesets for breaking changes). All are small (a `finally`, a `catch` reset, a contract note, a changeset file). Absorb them into plan v1.1, then re-run `/plan-confidence`.
