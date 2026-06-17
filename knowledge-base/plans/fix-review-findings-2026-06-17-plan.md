---
slug: fix-review-findings-2026-06-17
created_at: 2026-06-17
goal: Resolve the 4 HIGH + 4 owned MEDIUM/LOW findings from the remediate-code-review-2026-06-16 /review so the review re-runs to READY_TO_MERGE.
---

# Plan: Fix `/review` findings (remediate-code-review-2026-06-16)

Plan version: v1.0

## Goal

Drive `/review remediate-code-review-2026-06-16` from `NEEDS_FIXES` (4 HIGH) to `READY_TO_MERGE` by fixing the 4 HIGH findings plus the 4 owned MEDIUM/LOW findings — verified by every touched package's `pnpm test` exiting 0 with new RED→GREEN regression tests for each finding.

## Context

The 40-task `remediate-code-review-2026-06-16` remediation passed `/code-quality` (PASS_WITH_CAVEATS) but `/review` (7 specialist agents) returned `NEEDS_FIXES`: 0 BLOCKER, **4 HIGH**, 13 MEDIUM, 13 LOW, 29 INFO. Review report: `knowledge-base/reviews/remediate-code-review-2026-06-16-review-2026-06-17.md`.

Owner decision (2026-06-17): fix the **4 HIGH** + the **4 owned MEDIUM/LOW**; backlog the pre-existing-not-mine findings (F-conc-1 concurrent-activate race, F-conc-3 unregister teardown gap, F-arch-5 schema layering). Mode: full halt-loop + SEPA.

Each finding below is traceable to a specific review finding with a `file:line` and recommended action already vetted by the review agents.

## Baseline Context

### Files that will be touched

| File | LoC | Last sha | Why it exists / what changes |
|---|---|---|---|
| `packages/plugin-voice/src/ui/voice-recorder-bar.tsx` | 288 | 1d8ee52 | React STT bar; `createRecorder()` called with no args at :132 — the `T5.2` `onError` option is never passed (F-wire-1). |
| `packages/plugin-copilot/src/internal/runtime.ts` | 421 | b9f9ea3 | Copilot runtime. `roundRobinCursor`/`roundRobinDecision` Maps (:76,:84) never pruned on teardown (F-arch-2); `setTyping(true)` (:284) is outside the reserve try (F-conc-2); `frameUntrusted` (:396) single-pass fence strip (F-sec-2). |
| `packages/plugin-canvas/src/ui/renderers/sanitize.ts` | 154 | 342239f | SVG/HTML sanitizers. `sanitizeHtmlSrcdoc` verdict still regex-based (unquoted `<meta http-equiv=refresh>` bypass) — ADR D2 was applied only to `sanitizeSvg` (F-arch-1/F-sec-1). |
| `packages/auth-google/src/index.ts` | 276 | 340b78d | Google OIDC provider. `isLoopbackHost` (:48) classifies `0.0.0.0` (wildcard, not loopback) as exempt (F-sec-3). |
| `packages/plugin-payments/src/webhook.ts` | 256 | 7baea9d | Stripe webhook. `releaseError` logged raw at :238 without `redactSecrets()` (:187) (F-dom-pay-5). |

Test files (co-located per `rules/testing.md`): `voice-recorder-bar.test.tsx`, `runtime.test.ts` (copilot), `sanitize.test.ts` (canvas — verify path), `google-provider.test.ts`, `webhook.test.ts`.

### Current callers / dependents

- `createRecorder` — called once in the bar (:132) and by `recorder.test.ts`. The bar is the only production caller missing `onError`.
- `roundRobinCursor`/`roundRobinDecision` — read/written only inside `applyDispatcher` + (after fix) teardown methods. Private fields.
- `frameUntrusted` — called by `framePrompt` (:414,:420) only. Module-private.
- `isLoopbackHost` — called by `assertSafeOidcUrl` (:85) + `resolveOidcBaseUrl` (:112). Module-private.
- `sanitizeHtmlSrcdoc` — called by the artifact-security gate + `HtmlArtifact` renderer.
- webhook `release()` error path — internal to `processWebhook`.

### Domain glossary

- **Wiring triad pillar (a)** — every new public symbol has a production caller (the F-wire-1 gap: a fix existed but was unwired).
- **DOMPurify.removed verdict** — deriving the sanitize report from DOMPurify's reported removals (ADR D2 from the original plan), not an input/output regex diff.
- **Reservation** — the copilot budget atomic check+hold token (reserve/reconcile/release).

### Architecture boundaries affected

Per `rules/architecture.md`: changes are leaf-level (UI component wiring, internal runtime maps, sanitizer verdict, host predicate, log redaction). No layering changes, no new public exports, no DIP boundary crossings. Every file stays ≤ 500 LoC.

## Prior Art & Related Work

- The original `remediate-code-review-2026-06-16-plan.md` (the 40-task remediation these findings refine).
- ADR D2 of that plan (DOMPurify.removed verdict) — F-arch-1 extends it from SVG to HTML.
- The 7 `/review` agent finding files at `agents/review-remediate-code-review-2026-06-16-2026-06-17/findings/*.yml` — the precise evidence + recommended actions.

## ADRs

### D1 — Extend DOMPurify.removed verdict to `sanitizeHtmlSrcdoc` (F-arch-1)

The HTML srcdoc verdict uses an input/output regex that requires quoted `http-equiv` values, so `<meta http-equiv=refresh ...>` (valid HTML5, unquoted) bypasses it: DOMPurify strips the tag but `report.removedScript` stays `false`, so `enforceArtifactSecurity` does not throw and the unsafe srcdoc is persisted via the REST API. Decision: derive the verdict from DOMPurify's reported removals (a `RETURN_DOM`/`hooks`-based removal capture, mirroring `sanitizeSvg`'s `T1.4` migration), covering meta-refresh (quoted or not), iframe, embed, object, and on-handlers.

**Alternatives rejected:** (a) broaden the regex to allow unquoted attrs — rejected: regex-on-HTML is the exact lossy pattern ADR D2 banned; whack-a-mole. (b) leave it (render-time `HtmlArtifact` re-sanitizes) — rejected: direct REST API consumers receive the unsafe payload before render; the gate must be accurate.

### D2 — Prune round-robin Maps only when the room is empty of copilots (F-arch-2)

`roundRobinCursor`/`roundRobinDecision` are keyed by `roomId`; multiple copilots can share a room. Pruning on any single copilot's `unregisterCopilot` would reset rotation for siblings still in the room. Decision: prune `roomId` from both Maps in `unregisterCopilot` ONLY when `copilotsInRoom(roomId)` is empty after removal.

**Alternatives rejected:** (a) prune unconditionally on every unregister — rejected: corrupts fair rotation for remaining copilots. (b) key the maps by `copilotId:roomId` — rejected: round-robin is a room-level decision (per `T6.4`); per-copilot keys would re-break the dispatch-once invariant.

### D3 — `frameUntrusted` fixpoint fence-strip (F-sec-2)

Single-pass `split(OPEN).join("")` lets a nested payload reconstruct a marker after one pass. Decision: strip to a fixpoint (loop until no marker remains) before fencing.

**Alternatives rejected:** (a) switch to the AI-SDK `messages[]` role array — rejected: larger refactor beyond this fix's scope (the structural-roles upgrade is a separate backlog item); the fixpoint strip closes the documented bypass now. (b) reject input containing markers — rejected: a legitimate user could type the sentinel; stripping is non-destructive to intent.

## Dependency Graph

Phases are independent (different packages) and may proceed in any order; executed sequentially for clean per-phase mini-reviews.

```
Phase 1 (voice + copilot test) ─┐
Phase 2 (copilot runtime)      ─┼─ independent ─→ Integration Validation
Phase 3 (canvas + copilot + auth-google) ─┤
Phase 4 (payments)             ─┘
```

## Phase 1: Owned HIGH — wiring + test gap

### T1.1 — Wire recorder `onError` into `VoiceRecorderBar` (F-wire-1, HIGH)

#### Objective
A `MediaRecorder` error mid-recording surfaces via the bar's `onError` + sets phase=error, instead of being silently lost while the bar stays `recording`.

#### Why this step
1. **What:** pass `{ onError: surface }` to `createRecorder`; widen `recorderFactory` to `(opts?: CreateRecorderOptions) => Recorder` so the injected fake also receives it.
2. **Why now:** HIGH wiring gap — `T5.2` added `onError` but the bar never passed it (the "unwired fix" anti-pattern). Baseline row `voice-recorder-bar.tsx:132`.

#### Files to edit
```
packages/plugin-voice/src/ui/voice-recorder-bar.tsx — pass onError to createRecorder; widen recorderFactory signature
packages/plugin-voice/tests/voice-recorder-bar.test.tsx — RED: in-recording error → onError + phase=error
```

#### Deep file dependency analysis
- `surface(err)` callback already exists (:106). `recorderFactory` widened (optional opts) is backward-compatible (existing `() => rec` fakes ignore the arg).

#### Deep Dives
- Edge: error after stop (existing path, rejects stop()) unchanged; error during recording (the gap) now surfaces.

#### TDD
```
RED: test_in_recording_error_surfaces_via_onError() -- fake recorder emits error mid-recording; assert onError called + phase=error
GREEN: pass { onError: surface } to createRecorder; widen recorderFactory signature
REFACTOR: None expected
VERIFY: pnpm --filter @theokit/plugin-voice test
```

#### Concurrency tests

(none — single-threaded)

#### Acceptance Criteria
- [ ] In-recording error surfaces via `onError` + phase=error — verified by `pnpm --filter @theokit/plugin-voice test` (exit 0) plus `pnpm typecheck` (0 new errors).

#### DoD
- [ ] voice suite green; 0 new tsc/lint.

### T1.2 — Add runtime idle+broadcast double-spend test (F-tests-1, HIGH)

#### Objective
The concurrent idle+broadcast no-double-charge behavior is proven at the runtime level (not only at the BudgetBridge unit level).

#### Why this step
1. **What:** add `test_idle_and_broadcast_do_not_double_spend` driving idle + broadcast concurrently against a tight budget, asserting exactly one charge.
2. **Why now:** HIGH test-completeness gap — `T6.2` named this RED; the atomicity is covered at BudgetBridge but not the runtime concurrent vector. Baseline `runtime.test.ts`.

#### Files to edit
```
packages/plugin-copilot/tests/runtime.test.ts — RED: concurrent idle+broadcast charges once
```

#### Deep file dependency analysis
- Test-only; uses the existing fake provider + spy agent + getUsage() oracle.

#### Deep Dives
- Edge: tight `dailyUsd` budget admits exactly one invocation; the second gets budget-exceeded.

#### TDD
```
RED: test_idle_and_broadcast_do_not_double_spend() -- concurrent idle + broadcast, tight budget; assert getUsage charged once, not doubled
GREEN: test passes against the existing reservation model (proves no runtime-level double-spend)
REFACTOR: None expected
VERIFY: pnpm --filter @theokit/plugin-copilot test
```

#### Concurrency tests (applicable)

Atomic-counter invariant: fire idle + broadcast via overlapping dispatch against a 1-invocation budget; assert total charged == one invocation's cost (no lost update). The per-copilot queue + reservation must admit exactly one.

#### Acceptance Criteria
- [ ] Concurrent idle+broadcast charges exactly once — verified by `pnpm --filter @theokit/plugin-copilot test` (exit 0).

#### DoD
- [ ] copilot suite green.

## Phase 2: Owned concurrency — leak + reservation safety

### T2.1 — Prune round-robin Maps on empty-room teardown (F-arch-2, HIGH)

#### Objective
`roundRobinCursor` + `roundRobinDecision` do not grow unbounded across transient rooms.

#### Why this step
1. **What:** in `unregisterCopilot`, after `registry.delete`, if `copilotsInRoom(roomId)` is empty, delete `roomId` from both Maps (per ADR D2).
2. **Why now:** HIGH unbounded-memory leak; `roundRobinDecision` was introduced by `T6.4`. Baseline `runtime.ts:76,84,122`.

#### Files to edit
```
packages/plugin-copilot/src/internal/runtime.ts — prune both maps when room empties
packages/plugin-copilot/tests/runtime.test.ts — RED: maps pruned after last copilot in room unregisters; retained while a sibling remains
```

#### Deep file dependency analysis
- `copilotsInRoom` (:344) already exists. Pruning is guarded on emptiness to preserve sibling rotation.

#### Deep Dives
- Edge: two copilots in one room — unregister one → maps retained; unregister both → maps pruned.

#### TDD
```
RED: test_round_robin_maps_pruned_when_room_empties() -- register 2 copilots same room; unregister one -> cursor retained; unregister both -> cursor+decision deleted
GREEN: guarded prune in unregisterCopilot
REFACTOR: None expected
VERIFY: pnpm --filter @theokit/plugin-copilot test
```

#### Concurrency tests

(none — single-threaded)

State-cleanup is single-threaded teardown: register/unregister run on the JS event loop without interleave. The invariant (Map size returns to 0 after the last copilot in a room unregisters; retained while a sibling remains) is asserted via repeated register/unregister cycles. (The concurrent-activate race F-conc-1 is a separate, backlogged finding.)

#### Acceptance Criteria
- [ ] Maps pruned only when room empty; sibling rotation preserved — verified by `pnpm --filter @theokit/plugin-copilot test` (exit 0).

#### DoD
- [ ] copilot suite green; 0 new tsc/lint.

### T2.2 — Release reservation if `setTyping(true)` throws (F-conc-2, LOW)

#### Objective
A throw from `setTyping(true)` does not leak the held budget reservation.

#### Why this step
1. **What:** move `await reg.member.setTyping(true)` inside the inner try that holds `reconcile`/`release`, so a throw routes through the catch→release.
2. **Why now:** LOW budget-leak-on-error; reservation introduced by `T6.2`. Baseline `runtime.ts:284`.

#### Files to edit
```
packages/plugin-copilot/src/internal/runtime.ts — setTyping(true) inside the reserve try
packages/plugin-copilot/tests/runtime.test.ts — RED: setTyping throws -> reservation released (getUsage 0)
```

#### Deep file dependency analysis
- The try/catch/finally already holds release in both catch + defensive finally; only the `setTyping(true)` line moves inside.

#### Deep Dives
- Edge: setTyping throws → release runs → budget restored.

#### TDD
```
RED: test_reservation_released_when_settyping_throws() -- member.setTyping rejects; assert getUsage dailyUsedUsd == 0
GREEN: move setTyping(true) inside the try
REFACTOR: None expected
VERIFY: pnpm --filter @theokit/plugin-copilot test
```

#### Concurrency tests

(none — single-threaded)

Failure path is single-threaded: a throwing `setTyping` routes through catch→release within one invocation. The invariant (reservation released exactly once, settled-once; budget window returns to 0) is asserted via getUsage after the rejected invocation.

#### Acceptance Criteria
- [ ] setTyping throw releases the reservation; no budget leak — verified by `pnpm --filter @theokit/plugin-copilot test` (exit 0).

#### DoD
- [ ] copilot suite green.

## Phase 3: Security hardening

### T3.1 — DOMPurify-driven verdict for `sanitizeHtmlSrcdoc` (F-arch-1/F-sec-1, HIGH)

#### Objective
A malicious HTML srcdoc (meta-refresh quoted OR unquoted, iframe, embed, on-handler) yields an accurate removal verdict so `enforceArtifactSecurity` rejects it before persistence.

#### Why this step
1. **What:** replace the input/output regex verdict with a DOMPurify removal capture (mirroring `sanitizeSvg` / ADR D2), setting the report flags from what DOMPurify actually stripped.
2. **Why now:** HIGH stored-XSS bypass via REST API (unquoted meta-refresh). Baseline `sanitize.ts` `sanitizeHtmlSrcdoc`.

#### Files to edit
```
packages/plugin-canvas/src/ui/renderers/sanitize.ts — DOMPurify.removed-driven verdict for sanitizeHtmlSrcdoc
packages/plugin-canvas/tests/*sanitize*.test.ts — RED: unquoted meta-refresh + iframe srcdoc → report flags set
```

#### Deep file dependency analysis
- `classifyRemoved`/`createEmptyReport` already exist (used by sanitizeSvg). Reuse the same removal-capture mechanism for the HTML pass.

#### Deep Dives
- Edge: unquoted `<meta http-equiv=refresh ...>` → removedScript true; clean HTML → all flags false; iframe/embed/on-handler → respective flags.

#### TDD
```
RED: test_unquoted_meta_refresh_srcdoc_is_flagged() -- sanitizeHtmlSrcdoc('<meta http-equiv=refresh content=0>') -> report flag set + tag stripped
GREEN: DOMPurify.removed-driven verdict
REFACTOR: drop the regex pass
VERIFY: pnpm --filter @theokit/plugin-canvas test
```

#### Concurrency tests

(none — single-threaded)

#### Acceptance Criteria
- [ ] Unquoted meta-refresh + iframe srcdoc flagged; clean HTML not flagged — verified by `pnpm --filter @theokit/plugin-canvas test` (exit 0).

#### DoD
- [ ] canvas suite green; 0 new tsc/lint.

### T3.2 — `frameUntrusted` fixpoint fence-strip (F-sec-2, MEDIUM)

#### Objective
A nested marker payload cannot reconstruct a fence marker to escape the untrusted-data block.

#### Why this step
1. **What:** strip the OPEN/CLOSE markers to a fixpoint (loop until none remain) before fencing.
2. **Why now:** MEDIUM prompt-injection bypass (OWASP LLM01); `frameUntrusted` introduced by `T6.1`. Baseline `runtime.ts:396`.

#### Files to edit
```
packages/plugin-copilot/src/internal/runtime.ts — fixpoint strip in frameUntrusted
packages/plugin-copilot/tests/runtime.test.ts — RED: nested-marker payload fully stripped
```

#### Deep file dependency analysis
- `frameUntrusted` is module-private, called by `framePrompt`. Change is internal to the strip.

#### Deep Dives
- Edge: `<<<UNTRUSTED_USER<<<UNTRUSTED_USER_INPUT>>>_INPUT>>>` → no reconstructed marker after strip.

#### TDD
```
RED: test_nested_marker_payload_cannot_reconstruct_fence() -- framePrompt with nested-marker text; assert no full OPEN marker survives in the user-role prompt body
GREEN: fixpoint strip loop
REFACTOR: None expected
VERIFY: pnpm --filter @theokit/plugin-copilot test
```

#### Concurrency tests

(none — single-threaded)

#### Acceptance Criteria
- [ ] Nested-marker payload cannot reconstruct a fence — verified by `pnpm --filter @theokit/plugin-copilot test` (exit 0).

#### DoD
- [ ] copilot suite green.

### T3.3 — Remove `0.0.0.0` from `isLoopbackHost` (F-sec-3, LOW)

#### Objective
A poisoned OIDC discovery doc pointing at `http://0.0.0.0:PORT` is rejected (0.0.0.0 is the wildcard/INADDR_ANY, not a loopback destination).

#### Why this step
1. **What:** drop `"0.0.0.0"` from the loopback exemption set.
2. **Why now:** LOW SSRF-adjacent; introduced by T3.3. Baseline `auth-google/src/index.ts:58`.

#### Files to edit
```
packages/auth-google/src/index.ts — remove 0.0.0.0 from isLoopbackHost
packages/auth-google/tests/google-provider.test.ts — RED: http://0.0.0.0 endpoint rejected
```

#### Deep file dependency analysis
- `isLoopbackHost` callers (assertSafeOidcUrl, resolveOidcBaseUrl) unaffected; localhost/127/::1 still exempt.

#### Deep Dives
- Edge: `http://0.0.0.0:8080/...` discovered endpoint → insecure_oidc_url; `http://localhost` still allowed.

#### TDD
```
RED: test_0_0_0_0_endpoint_rejected() -- discovery doc with http://0.0.0.0 token_endpoint -> insecure_oidc_url
GREEN: remove 0.0.0.0 from the set
REFACTOR: None expected
VERIFY: pnpm --filter @theokit/auth-google test
```

#### Concurrency tests

(none — single-threaded)

#### Acceptance Criteria
- [ ] http://0.0.0.0 rejected; loopback still allowed — verified by `pnpm --filter @theokit/auth-google test` (exit 0).

#### DoD
- [ ] auth-google suite green.

## Phase 4: Payments hygiene

### T4.1 — Redact `releaseError` before logging (F-dom-pay-5, LOW)

#### Objective
A `release()` failure whose error carries credentials is redacted before hitting the server log.

#### Why this step
1. **What:** wrap `releaseError` in `redactSecrets()` in the `processWebhook` release-failure log (mirroring the handler-error path).
2. **Why now:** LOW secret-leak-in-logs; `redactSecrets` already exists. Baseline `webhook.ts:238`.

#### Files to edit
```
packages/plugin-payments/src/webhook.ts — redactSecrets(releaseError) in the release-failure log
packages/plugin-payments/tests/webhook.test.ts — RED: release throws secret-bearing error -> log redacted
```

#### Deep file dependency analysis
- `redactSecrets` (:187) already used for handler errors (:247). Apply to the release path.

#### Deep Dives
- Edge: release() throws Error('sk_live_xxx...') → log shows redacted, not the secret.

#### Failure scenarios (applicable — external I/O)

- **release() failure mode:** the idempotency store's `release()` rejects (e.g., DB connection error containing credentials). Test reproduces by injecting a store whose `release()` throws a secret-bearing error; expected: `console.error` receives the redacted string, never the raw secret.

#### TDD
```
RED: test_release_error_is_redacted_in_log() -- store.release throws Error with a secret; assert console.error arg is redacted
GREEN: redactSecrets(releaseError)
REFACTOR: None expected
VERIFY: pnpm --filter @theokit/plugin-payments test
```

#### Concurrency tests

(none — single-threaded)

#### Acceptance Criteria
- [ ] release-failure log redacted — verified by `pnpm --filter @theokit/plugin-payments test` (exit 0).

#### DoD
- [ ] payments suite green.

## Coverage Matrix

| # | Review finding | Severity | Task | Resolution |
|---|---|---|---|---|
| 1 | F-wire-1 | HIGH | T1.1 | recorder onError wired into VoiceRecorderBar + test |
| 2 | F-tests-1 | HIGH | T1.2 | runtime idle+broadcast double-spend test added |
| 3 | F-arch-2 | HIGH | T2.1 | round-robin Maps pruned on empty-room teardown |
| 4 | F-conc-2 | LOW | T2.2 | setTyping(true) inside reserve try (no budget leak) |
| 5 | F-arch-1 / F-sec-1 | HIGH | T3.1 | DOMPurify.removed verdict for sanitizeHtmlSrcdoc |
| 6 | F-sec-2 | MEDIUM | T3.2 | frameUntrusted fixpoint fence-strip |
| 7 | F-sec-3 | LOW | T3.3 | 0.0.0.0 removed from isLoopbackHost |
| 8 | F-dom-pay-5 | LOW | T4.1 | redactSecrets(releaseError) in webhook |

Backlogged (pre-existing, NOT owned by the original remediation — per owner decision): F-conc-1 (concurrent activate() race), F-conc-3 (unregisterCopilot teardown gap), F-arch-5 (schema.ts domain→UI layering). Logged to `knowledge-base/backlog.md`.

## Global DoD

- [ ] Every touched package's `pnpm test` exits 0 (new RED→GREEN test per finding).
- [ ] `pnpm typecheck` introduces 0 new errors vs the pre-fix baseline (40 pre-existing).
- [ ] `pnpm lint` introduces 0 new errors (per-file cur ≤ head).
- [ ] CHANGELOG `[Unreleased]` updated for the consumer-visible fixes (F-wire-1, F-arch-1, F-sec-2, F-sec-3, F-dom-pay-5); changesets added.
- [ ] Each commit references its finding ID; atomic per task.
- [ ] Re-run `/review remediate-code-review-2026-06-16` → 0 HIGH (verdict ≥ READY_TO_MERGE, modulo backlogged-with-rationale).
- File-size budget: every touched file stays ≤ 500 LoC.

## Drawbacks & Risks

| Risk | Severity | Mitigation | Owner |
|---|---|---|---|
| T3.1 changes a security verdict (sanitizeHtmlSrcdoc) — risk of false positive/negative | HIGH | Reuse the exact `classifyRemoved`/removal-capture mechanism already proven for `sanitizeSvg` (original `T1.4`); tests for clean-HTML (no false flag) + malicious (flag). | implementer |
| T2.1 Map pruning could break sibling rotation if unguarded | MEDIUM | ADR D2 guard (prune only when `copilotsInRoom` empty) + a 2-copilot retention test. | implementer |
| SEPA orthogonal-LLM weekly quota may still be exhausted (resets 2026-06-22) | LOW | Pre-COMMIT SEPA gate degrades to documented self-review (as in original `T9.1`). | implementer |

## Unresolved Questions

- F-sec-2's stronger fix (AI-SDK `messages[]` structural roles) is deferred to a backlog item; the fixpoint strip closes the documented bypass but framing-based isolation is inherently weaker than structural roles. (Tracked; not blocking.)
- Whether F-arch-1's `RETURN_DOM`/hook removal-capture for the HTML profile exactly matches the SVG profile's mechanism will be confirmed at T3.1 RED (the test pins behavior either way).

## Failure scenarios

- **T4.1 — payments webhook release() failure:** see T4.1 § Failure scenarios (store.release() rejects with a secret-bearing error → log must be redacted).
- No other task touches external I/O (UI event, in-memory maps, string transform, host predicate, sanitizer) — `(none — no external I/O touched)` for T1.1, T1.2, T2.1, T2.2, T3.1, T3.2, T3.3.

## Final Phase: Integration Validation (MANDATORY)

```
pnpm --filter @theokit/plugin-voice --filter @theokit/plugin-copilot --filter @theokit/plugin-canvas --filter @theokit/auth-google --filter @theokit/plugin-payments test
pnpm typecheck   # 0 new vs baseline
pnpm lint        # 0 new per touched file
/review remediate-code-review-2026-06-16   # confirm 0 HIGH
```

### Acceptance Criteria
- [ ] All 5 touched package suites green.
- [ ] 0 new tsc/lint errors vs baseline.
- [ ] `/review` re-run reports 0 HIGH (READY_TO_MERGE, modulo backlogged-with-ADR-rationale).
