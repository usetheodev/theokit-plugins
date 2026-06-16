# SEPA Initial Brief — remediate-code-review-2026-06-16 (MODE=VERBOSE)

Standing reference for the implementer across all 40 tasks. Re-read § 3 before each COMMIT.

## 1. Cross-cutting risks (every task)
- **EC-1..EC-4 are MUST-FIX** (the plan only scores SHIPPABLE because v1.1 absorbed them):
  - EC-1 (T4.1): `catch (e){ state.docInit = undefined; throw e }` — RED `test_failed_doc_init_clears_memo_and_allows_retry` must fail first.
  - EC-2 (T6.2/T6.6): reservation reconcile/release in `finally` — RED `test_reservation_released_when_runagent_throws`.
  - EC-3 (T2.2/T2.3): document handler idempotency contract in ADR D4/handler docs + assert via `test_partial_failure_documents_handler_idempotency_requirement`.
  - EC-4 (T2.3+T3.1): physically create `.changeset/payments-webhook-error-shape.md` and `.changeset/auth-magic-link-store-schema.md`.
- **Only two public-contract breaks allowed** (D5 webhook error shape, D6 magic-link store) — each needs changeset + CHANGELOG + migration note. Any other public-signature change = scope creep → HALT. Honor every Baseline "Invariants to preserve" cell.
- **CHANGELOG `[Unreleased]` entry** for every prod-source change (Rule 6).
- **Runtime-metric pillar (c)** under-delivery risk: T2.2, T2.3, T5.1, T6.2, T6.6 add paths needing observable counters.
- **RED-before-GREEN gameable**: concurrency RED (T2.2, T3.1, T4.1, T4.2, T4.3, T5.1, T5.5, T6.2) MUST use a barrier (Promise.all/deferred) — single-thread interleaves cleanly and passes vacuously.
- **Phase 9 behavior-preserving only** (EC-10 characterization snapshots first; watch this/closure binding).

## 2. Task ordering (real dependencies)
- T9.1 per-file gated: `sanitize.ts`(#186) AFTER T1.4; `stt/tts`(#188/#189) AFTER T5.1.
- T6.6 depends on T6.2 (reservation model). T6.4 + T6.2 both touch runtime.ts dispatch — land T6.2 first.
- T2.4 ships with/after T2.2 (reorder makes a real store matter).
- Phases 1–8 otherwise independent per package, parallelizable.

## 3. Top 8 gotchas
1. **[CRITICAL] T1.1** — pillar (a) faked: the fix IS calling `enforceArtifactSecurity` from `route-handlers.create()` (between validateArtifact and store.insert, error→400). A test calling the function directly without the REST path repeats the original #176 defect.
2. **T1.4** — do NOT keep the post-sanitize regex (D2 rejects it); verdict from `purify.removed`, URL policy via `ALLOWED_URI_REGEXP`+`uponSanitizeAttribute`.
3. **T2.1** — no `amount*100`; zero-decimal keyed on currency CODE not amount; `Number.isInteger` assert; EC-5 reject >MAX_SAFE_INTEGER.
4. **T2.2** — `markProcessed` strictly AFTER successful dispatch; NOT in a `finally` (would mark on throw). RED: throwing handler invoked on both deliveries.
5. **T4.1** — EC-1 reject path clears memo; prove single-doc by spying on Y.Doc constructor identity.
6. **T6.2** — EC-2 release reservation in `finally`; reserve+charge one critical section; idle-trigger MUST enter the same queue (the #219 bypass).
7. **T5.1** — EC-8 feature-detect AbortSignal.timeout; single 504 on double-abort; TTS streamed body cancelled on client abort; `init.signal` always provided.
8. **T1.3** — sanitizeSvg(result.svg) before dangerouslySetInnerHTML, keep securityLevel:strict; T1.2/EC-6 malformed base64 svg+xml → clean reject not 500.

Honorable: T3.1 unsalted SHA-256 is CORRECT (EC-12, high-entropy tokens) — don't bcrypt it. T2.4/EC-13 NODE_ENV guard is advisory. T4.3/EC-9 yjs overflow → DISCONNECT not drop-oldest.

## 4. Wiring-triad reality
- **Pure refactor/test-only (pillar a/b N/A, judge behavior preservation):** T1.5, T5.7, T8.1, T8.2, T9.1.
- **Tighten existing behavior (caller exists; exercise the new branch):** T1.4, T2.1, T2.3, T2.5, T3.2-T3.4, T4.2, T4.4, T5.2-T5.6, T6.3-T6.5, T6.7, T7.1-T7.5.
- **New reachable path needing REAL caller + integration test + metric (scrutinize pillar a):** T1.1, T1.2, T1.3, T2.2, T2.3, T2.4, T4.1, T4.3 (ships new `server-integration.test.ts`), T5.1, T6.1, T6.2, T6.6. No-op caller / import-only test = faked pillar (a) → HALT.

Standing reminders: Honest BLOCKED > false PASS. Hard caps (symbol_fabrication_*, dead_code_unallowlisted_*) NOT ADR-deferrable in-loop. No --no-verify, no @ts-expect-error w/o rationale, no weakening tests/coverage. No new cross-package imports.
