# Plan: Remediate all 72 findings from the 2026-06-16 code review

> **Version 1.2** — (v1.2 via /plan-improve → SHIPPABLE 96.8: ADR defs converted to `### Dn` headers, concurrency-test posture de-fenced with exact race-aware signals, acceptance criteria made executable. v1.1 absorbed the 4 MUST-FIX edge cases from `knowledge-base/reviews/remediate-code-review-2026-06-16-edge-cases-2026-06-16.md`: EC-1 in-flight promise reset, EC-2 reservation release on failure, EC-3 per-handler idempotency contract, EC-4 Changesets for breaking changes.) The 2026-06-16 `loop-code-review` audit of the `@theokit/*` product packages produced **72 findings** (1 critical, 26 high, 34 medium, 11 low) persisted in `code-review-output/code-review.db`. This plan remediates **every one of them** — code defects fixed TDD-first (the RED regression test closes the mirror test-gap finding), structured in 9 thematic phases ordered by risk (stored-XSS → money → auth → concurrency → resilience → AI safety → CLI → test-quality → complexity), followed by a mandatory integration-validation gate. Outcome: a re-audit reports **0 findings at or above `low`** and the full `pnpm test && typecheck && lint` chain is green.

## Goal

> "Remove all 72 open findings from the 2026-06-16 code review (1 critical, 26 high, 34 medium, 11 low) across the 11 `@theokit/*` packages, measured by a re-run of `loop-code-review` reporting **0 findings ≥ low** AND `pnpm test && pnpm typecheck && pnpm lint` exiting 0."

- **Primary verb:** *remove* (end-state: finding count 72 → 0).
- **Metric (observable):** re-audit finding count == 0 ≥ low; CI chain exit 0; every regression test added by this plan green.

## Context

The audit (`code-review-output/final_report.md`) found the product is well-engineered overall (max CC=24, no god files, real DOMPurify sanitization, disciplined OAuth) but carries defects clustered in four high-value seams: a **stored-XSS bypass** on the canvas REST route, **money correctness** in Stripe currency/idempotency, **realtime/voice concurrency & timeout** gaps, and **AI prompt-injection/budget** handling in copilot. A prior remediation pass (`fix-code-review-findings-plan.md`, CHANGELOG `[0.1.0]`) added DOMPurify sanitization but left the REST route unwired — exactly the kind of partial fix this plan must not repeat. The audit also found the test suite is *volume-healthy but protection-inverted*: the adversarial/race/timeout paths where these defects live are untested, so every code fix here is paired with the regression test the audit said was missing.

Severity-band note: at the engagement's `high` threshold the reportable band was 1 critical + 26 high; the user has explicitly scoped this plan to **all 72 findings** including medium/low, so phases 7–9 cover CLI correctness, test-quality, and cyclomatic-complexity cleanup as well.

## Baseline Context (deep review of current state)

### Files that will be touched

| File | LoC today | Last commit (sha + date) | Why it exists today | Invariants to preserve |
|---|---|---|---|---|
| `packages/plugin-canvas/src/route-handlers.ts` | 200 | `ef73963` (2026-06-11) | REST CRUD for artifacts (`create`/`list`/`get`) | Public handler signatures stay stable; agent-tool path already enforces security |
| `packages/plugin-canvas/src/schema.ts` | 292 | `64aa5a0` (2026-06-11) | `validateArtifact` + `enforceArtifactSecurity` boundary | `CanvasArtifactSecurityError` type stays back-compat |
| `packages/plugin-canvas/src/ui/renderers/mermaid-artifact.tsx` | 91 | `a2f8233` (2026-06-11) | Renders mermaid diagrams | Must keep `securityLevel:'strict'` |
| `packages/plugin-canvas/src/ui/renderers/sanitize.ts` | 114 | `e094326` (2026-06-11) | `sanitizeSvg`/`sanitizeHtml` + `classifyRemovals` | `sanitizeSvg`/`sanitizeHtml` public signatures stable |
| `packages/plugin-canvas/src/define-artifact-tool.ts` | 193 | `fdc0eb5` (2026-06-03) | Agent-tool artifact path (already secured) | Behavior unchanged after try/catch removal |
| `packages/plugin-canvas/src/store.ts` | 379 | `0cc74b1` (2026-06-11) | In-memory + sqlite artifact stores | Store interface stable |
| `packages/plugin-canvas/src/ui/artifact-actions.ts` | 188 | `f5188bd` (2026-05-30) | Copy/download serialization | `serializeArtifactForCopy` output identical |
| `packages/plugin-canvas/tests/route-handlers.test.ts` | 223 | `2cb7dfd` (2026-06-11) | REST handler tests | — |
| `packages/plugin-canvas/tests/schema.test.ts` | 406 | `fdc0eb5` (2026-06-03) | schema/security tests | — |
| `packages/plugin-canvas/tests/artifact-renderer.test.tsx` | 223 | `fdc0eb5` (2026-06-03) | renderer tests | — |
| `packages/plugin-payments/src/currency.ts` | 44 | `d5ebfb4` (2026-06-04) | `formatAmountForStripe` minor-unit conversion | Public signature stable; return type `number` (cents) |
| `packages/plugin-payments/src/webhook.ts` | 201 | `e5ef79c` (2026-06-11) | `WebhookRegistry` + `processWebhook` | Signature verification path stays intact |
| `packages/plugin-payments/src/idempotency-store.ts` | 104 | `d5ebfb4` (2026-06-04) | memory + pluggable idempotency stores | `IdempotencyStore` interface stable |
| `packages/plugin-payments/src/stripe-client.ts` | 59 | `d5ebfb4` (2026-06-04) | Stripe SDK client factory | — |
| `packages/plugin-payments/tests/checkout.test.ts` | 106 | `d5ebfb4` (2026-06-04) | currency/checkout tests | — |
| `packages/plugin-payments/tests/webhook.test.ts` | 378 | `2cb7dfd` (2026-06-11) | webhook tests | — |
| `packages/auth-magic-link/src/index.ts` | 169 | `38f7841` (2026-06-03) | magic-link provider (start/callback/resolveEmail) | `Provider` contract stable across auth-* |
| `packages/auth-magic-link/src/store.ts` | 91 | `c8cd3d0` (2026-06-03) | token store (memory + sqlite) | `MagicLinkTokenStore` interface stable |
| `packages/auth-google/src/index.ts` | 190 | `38f7841` (2026-06-03) | Google OIDC provider | state/PKCE behavior stable |
| `packages/auth-github/src/index.ts` | 190 | `38f7841` (2026-06-03) | GitHub OAuth provider | state CSRF behavior stable |
| `packages/plugin-realtime/src/yjs-provider.ts` | 277 | `a2f8233` (2026-06-11) | Yjs CRDT provider (rooms, docs, awareness) | `RealtimeProvider` interface stable |
| `packages/plugin-realtime/src/internal/server-integration.ts` | 245 | `0c4566a` (2026-06-04) | server stream/connection bridge | — |
| `packages/plugin-realtime/src/internal/runtime.ts` | 244 | `0c4566a` (2026-06-04) | frame dispatch runtime | — |
| `packages/plugin-realtime/src/react/index.ts` | 297 | `0c4566a` (2026-06-04) | React hooks | hook return shapes stable |
| `packages/plugin-realtime/tests/yjs-provider.test.ts` | 67 | `0c4566a` (2026-06-04) | yjs tests | — |
| `packages/plugin-realtime/tests/server-integration.test.ts` (NEW) | 0 | — | (to create) | — |
| `packages/plugin-voice/src/stt-server.ts` | 193 | `fdc0eb5` (2026-06-03) | STT handler → upstream fetch | `handleSttRequest` signature stable |
| `packages/plugin-voice/src/tts-server.ts` | 149 | `fdc0eb5` (2026-06-03) | TTS handler → upstream fetch (streamed) | `handleTtsRequest` signature stable |
| `packages/plugin-voice/src/recorder.ts` | 282 | `fdc0eb5` (2026-06-03) | MediaRecorder wrapper | `onError` callback contract |
| `packages/plugin-voice/src/ui/use-tts.ts` | 233 | `f5188bd` (2026-05-30) | TTS playback hook | — |
| `packages/plugin-voice/src/ui/voice-recorder-bar.tsx` | 278 | `fdc0eb5` (2026-06-03) | recorder UI | — |
| `packages/plugin-voice/src/index.ts` | 97 | `fdc0eb5` (2026-06-03) | barrel + docstring | exports stable |
| `packages/plugin-voice/tests/recorder.test.ts` | 290 | `f5188bd` (2026-05-30) | recorder tests | — |
| `packages/plugin-voice/tests/stt-server.test.ts` | 148 | `f5188bd` (2026-05-30) | stt tests | — |
| `packages/plugin-voice/tests/use-tts.test.tsx` | 228 | `f5188bd` (2026-05-30) | use-tts tests | — |
| `packages/plugin-copilot/src/internal/runtime.ts` | 318 | `bf00839` (2026-06-11) | copilot runtime (frame dispatch, budget, prompt) | `CopilotRuntime` public API stable |
| `packages/plugin-copilot/src/internal/budget-bridge.ts` | 125 | `6fcd4f1` (2026-06-11) | budget window/charge | `BudgetBridge` interface stable |
| `packages/plugin-copilot/src/define-copilot.ts` | 136 | `69b9a30` (2026-06-04) | `defineCopilot` factory | output shape stable |
| `packages/plugin-copilot/src/react/copilot-provider.tsx` | 186 | `69b9a30` (2026-06-04) | React provider | `CopilotProviderProps` — reconcile w/ README |
| `packages/plugin-copilot/src/react/hooks.ts` | 112 | `69b9a30` (2026-06-04) | copilot hooks | reconcile signatures w/ README |
| `packages/plugin-copilot/tests/runtime.test.ts` | 429 | `2cb7dfd` (2026-06-11) | runtime tests | — |
| `packages/plugin-db-drizzle/src/cli/db.ts` | 84 | `1766ed0` (2026-06-04) | drizzle-kit CLI arg builder | verb set stable |
| `packages/plugin-db-drizzle/src/index.ts` | 78 | `1766ed0` (2026-06-04) | plugin entry + CLI registration | — |
| `packages/plugin-db-drizzle/src/devtools.ts` | 53 | `5098ea0` (2026-06-11) | studio iframe devtools | — |
| `packages/plugin-email/tests/render-react-email.test.ts` | 21 | `3f5ada6` (2026-06-04) | email render test | — |
| `packages/plugin-forms/tests/unit/TheoForm.test.tsx` | 80 | `2cb7dfd` (2026-06-11) | form test | — |
| `packages/plugin-realtime/src/internal/runtime.ts` | 244 | `0c4566a` (2026-06-04) | (see above) | — |
| `CHANGELOG.md` | — | — | workspace changelog | append-only `[Unreleased]` |
| `.changeset/payments-webhook-error-shape.md` (NEW) | 0 | — | (to create) EC-4 semver bump for D5 | — |
| `.changeset/auth-magic-link-store-schema.md` (NEW) | 0 | — | (to create) EC-4 semver bump for D6 | — |

> NEW test files created by tasks (also implied above): `packages/plugin-realtime/tests/server-integration.test.ts`. All other tests extend existing files in the table.

### Current callers / dependents

- **Symbol:** `enforceArtifactSecurity()` in `packages/plugin-canvas/src/schema.ts`
  - Callers (production): `packages/plugin-canvas/src/define-artifact-tool.ts:168` (agent path — secured). NOT called in `route-handlers.ts:121` (the defect).
  - Callers (tests): `packages/plugin-canvas/tests/schema.test.ts`, `define-artifact-tool.test.ts`
  - External: yes — part of `@theokit/plugin-canvas` and `/server` public surface; signature MUST stay back-compat.
- **Symbol:** `formatAmountForStripe()` in `packages/plugin-payments/src/currency.ts`
  - Callers (production): `packages/plugin-payments/src/checkout.ts` (checkout session amounts)
  - Callers (tests): `packages/plugin-payments/tests/checkout.test.ts:77`
  - External: yes — exported from `@theokit/plugin-payments`. Return contract (integer cents) MUST stay stable.
- **Symbol:** `processWebhook()` / `WebhookRegistry.dispatch()` in `packages/plugin-payments/src/webhook.ts`
  - Callers (production): consumer HTTP route (host app); `WebhookResult` is the public contract returned to the HTTP layer.
  - Callers (tests): `packages/plugin-payments/tests/webhook.test.ts`
  - External: yes — `WebhookResult` shape is public; changing `error` to a sanitized `{code,message}` is a deliberate contract change (ADR D5).
- **Symbol:** `handleCallback()` in `packages/auth-magic-link/src/index.ts`
  - Callers (production): host auth route; conforms to the shared `Provider` contract used by `auth-github`/`auth-google`.
  - Callers (tests): `packages/auth-magic-link/tests/*`
  - External: yes — `Provider` interface shared across all three auth-* packages; the `_tx` parameter already exists in the signature (today ignored).
- **Symbol:** `ensureYjs()` / `applyYjsUpdate()` in `packages/plugin-realtime/src/yjs-provider.ts`
  - Callers (production): `joinRoom`/`applyYjs*` within the same file; `RealtimeProvider` consumers.
  - Callers (tests): `packages/plugin-realtime/tests/yjs-provider.test.ts`
  - External: yes — `RealtimeProvider` interface; the in-flight-promise fix is internal to the provider.
- **Symbol:** `handleSttRequest()` / `handleTtsRequest()` in `packages/plugin-voice/src/{stt,tts}-server.ts`
  - Callers (production): host voice routes; `fetchImpl` is injected (DIP).
  - Callers (tests): `packages/plugin-voice/tests/{stt,tts}-server.test.ts`
  - External: yes — handler signatures public; adding a `timeoutMs` option is additive.
- **Symbol:** `CopilotRuntime.handleFrame()` / idle-trigger `runAgent()` in `packages/plugin-copilot/src/internal/runtime.ts`
  - Callers (production): `AgentRoomMember`; trigger-evaluator idle path.
  - Callers (tests): `packages/plugin-copilot/tests/runtime.test.ts`
  - External: `CopilotRuntime` is exported; internal frame handling is private.

> Cross-repo consumers (host apps that import `@theokit/*`) are not in this repo. Public-API-affecting changes (webhook `error` shape, copilot README props) are flagged in ADRs; their migration notes go in each package CHANGELOG.

### Domain glossary

- **artifact** — a typed canvas payload (`code`/`svg`/`mermaid`/`image`/`diff`/`slide-deck`/...) published to the canvas; security-gated before persistence.
- **enforceArtifactSecurity** — the boundary function that rejects script-bearing artifacts (`CanvasArtifactSecurityError`).
- **idempotency / exactly-once** — a Stripe `event.id` must trigger its handler at most/exactly once across retries; ordering of "mark processed" vs "dispatch" decides at-most-once vs at-least-once.
- **zero-decimal currency** — currencies (JPY, KRW, VND, …) Stripe expects in major units (no ×100); detection MUST be by currency code, never by the amount value.
- **OAuthTransaction (`tx`)** — per-sign-in state carrying the CSRF `state` token; validated in `handleCallback` for github/google, ignored in magic-link (the defect).
- **awareness / Y.Doc** — Yjs CRDT primitives; one shared `Y.Doc` per room must exist; concurrent creation must not orphan a duplicate.
- **wiring triad** — caller + integration test + runtime metric required for a feature to count as wired (per `rules/cycle-implement.md`).

### Architecture boundaries affected

Per `rules/architecture.md`: changes stay within each package's existing layering (interface → use-case → infra adapters). DIP boundaries preserved — e.g., `fetchImpl` injection in voice, `IdempotencyStore`/`MagicLinkTokenStore` interfaces in payments/auth remain the seam; no domain code gains a concrete driver import. The webhook `WebhookResult.error` change (D5) narrows a public contract (allowed, ADR-documented). No new cross-package imports introduced.

## Prior Art & Related Work

- **Internal:** `knowledge-base/plans/fix-code-review-findings-plan.md` — the prior remediation pass (2026-06-11) that added DOMPurify sanitization but left `route-handlers.ts` create() unwired; this plan completes that defense-in-depth (finding #176).
- **Internal audit:** `code-review-output/final_report.md` + `code-review-output/code-review.db` — source of all 72 findings with `file:line` evidence.
- **Patterns skills:** none — no `skills/*-patterns/` registered in this repo (verified `ls -d .claude/skills/*-patterns/` → no matches).
- **Blueprints:** none — `knowledge-base/discoveries/blueprints/` is empty.
- **External literature:**
  - Stripe zero-decimal currency list — https://docs.stripe.com/currencies#zero-decimal (D3 currency fix).
  - OWASP A03 Injection / Stored XSS — https://owasp.org/Top10/A03_2021-Injection/ (canvas REST gate, mermaid sanitize).
  - OWASP LLM01 Prompt Injection — https://genai.owasp.org/llmrisk/llm01-prompt-injection/ (copilot user-role isolation).
  - DOMPurify hooks/`removed[]` API — https://github.com/cure53/DOMPurify#hooks (sanitize verdict from removed nodes, not regex diff).

## Objective

- [ ] **O1 — Stored-XSS closed:** the canvas REST create path and all artifact kinds (mermaid/slide-deck/svg-data) go through `enforceArtifactSecurity`; sanitization verdict is DOMPurify-driven, not regex-diff. (closes #176,#177,#178,#179,#180,#181 + tests #229,#230,#231)
- [ ] **O2 — Money correct & exactly-once restored:** currency conversion is code-keyed + integer-exact; webhook marks processed only after success with sanitized errors. (closes #199,#200,#167,#208,#201,#202,#210 + tests #225,#226)
- [ ] **O3 — Auth hardened:** magic-link binds CSRF state + hashes tokens + caps body; google OIDC SSRF gated; github email failure surfaced. (closes #190,#191,#192,#203,#204,#205,#209)
- [ ] **O4 — Realtime race-free:** yjs doc creation/apply is in-flight-safe; server-integration aborts cleanly with a bounded queue. (closes #193,#194,#195,#196,#197,#198 + tests #234,#235)
- [ ] **O5 — Voice resilient:** STT/TTS upstream fetch has timeout/abort; recorder/UI races and error reflection fixed. (closes #211,#212,#213,#214,#215,#216,#217,#175 + tests #236,#237,#238)
- [ ] **O6 — Copilot AI-safe:** prompt injection isolated; budget TOCTOU/queue/atomicity fixed; runtime contracts tightened; docs reconciled. (closes #218,#219,#220,#221,#222,#223,#224,#174,#172,#173 + tests #232,#233)
- [ ] **O7 — CLI & misc correctness:** db-drizzle reset/driver/seed/conflict + devtools sandbox; email/forms test-quality. (closes #168,#169,#170,#171,#206,#207,#227,#228)
- [ ] **O8 — Complexity ≤ target:** the 8 functions flagged CC 16–24 reduced toward ≤ 10. (closes #182,#183,#184,#185,#186,#187,#188,#189)

> Note: O1–O8 exceed the ~7 soft cap deliberately — the user scoped "all 72 findings" into one consolidated plan; each objective is an independently-shippable phase and the Goal metric (0 findings) is the single contract.

## ADRs

### D1 — Wire `enforceArtifactSecurity` at every persistence boundary, not just the agent-tool path.
- *Decision:* Call `enforceArtifactSecurity` inside `route-handlers.create()` and ensure the boundary covers mermaid/slide-deck/svg-data kinds; keep the agent-tool path as-is.
- *Rationale:* Defense-in-depth at the boundary (OWASP A03); the prior fix refactored the function body but left a reachable bypass. SRP — the boundary owns security, renderers stay presentational.
- *Alternatives:* (a) Sanitize only in renderers — rejected: persistence stores unsafe data, other consumers re-render it. (b) Middleware wrapper around all routes — rejected: heavier, the create path is the only write.
- *Consequences:* One security choke-point; a malicious POST is rejected with 400.

### D2 — Drive the sanitization security verdict from DOMPurify `removed[]`/hooks, and delete the post-sanitize regex pass.
- *Decision:* Replace the regex diff in `classifyRemovals` with DOMPurify's reported removals; enforce URL policy via `ALLOWED_URI_REGEXP` + `uponSanitizeAttribute`, not a post-hoc regex mutate.
- *Rationale:* "Don't reinvent the wheel" (Rule 9) — DOMPurify already reports what it removed; a regex pass over sanitized output can re-introduce/mis-handle markup.
- *Alternatives:* Keep regex as belt-and-suspenders — rejected: the audit (#179) showed the regex mutate can corrupt valid output and the verdict (#180) is lossy.
- *Consequences:* Verdict is exact; fewer false positives/negatives.

### D3 — Detect zero-decimal currencies from Stripe's static code set; compute integer minor units without binary-float scaling.
- *Decision:* Hardcode Stripe's published zero-decimal currency set keyed on code; convert via integer/decimal-safe math; assert `Number.isInteger` before return.
- *Rationale:* Money MUST be exact (Rule 8 fail-loud); amount-dependent `Intl` detection undercharges whole-number USD 100×; `amount*100` float is lossy.
- *Alternatives:* (a) keep `Intl` detection — rejected: amount-dependent, the root defect. (b) pull a currency npm lib — rejected for a fixed, small, well-known set (KISS); revisit if the set grows.
- *Consequences:* Correct charges; a tiny static table to maintain against Stripe's list.

### D4 — Mark webhook events processed only AFTER successful dispatch; aggregate handler errors.
- *Decision:* Reorder `markProcessed` to run after `dispatch` succeeds; on handler failure return a non-2xx so Stripe retries; aggregate multiple handler errors (`AggregateError`) instead of swallowing.
- *Rationale:* Restores documented exactly-once/at-least-once; partial side effects + lost errors are a money-boundary hazard (Rule 8).
- *Alternatives:* Two-phase commit per handler — rejected: over-engineered for the current single-store model (YAGNI).
- *Consequences:* Transient handler failures are retried; idempotency store now guards against the (now-rare) double-dispatch.
- *Edge-case contract (EC-3):* with multiple handlers + mark-after-success, a partial failure (handler A ok, B throws) leaves the event un-marked, so the retry re-runs A too. Therefore **webhook handlers MUST be individually idempotent** — this is a documented contract requirement (surfaced in each handler's docs and asserted by a test). Per-(event,handler) marking is the alternative if idempotency cannot be guaranteed; chosen approach: document the idempotency requirement (KISS) and test that only the failed handler's effect is retried.

### D5 — Narrow `WebhookResult.error` to a sanitized `{code,message}`; log full errors via a redacting logger.
- *Decision:* Public boundary exposes only sanitized error; raw error logged server-side.
- *Rationale:* Prevent secret/PII leakage to the HTTP layer (#201).
- *Alternatives:* Leave raw error, document "don't log it" — rejected: relies on every consumer doing the right thing.
- *Consequences:* Public contract change → CHANGELOG note in `@theokit/plugin-payments`.

### D6 — Bind magic-link tokens to their issuing transaction (CSRF) and hash tokens at rest.
- *Decision:* Persist `tx.state`/nonce with the token at `startSignIn`; require match in `handleCallback`; store only `sha256(token)`.
- *Rationale:* Magic-link tokens are otherwise unbound bearer credentials (login-CSRF, replay); plaintext-at-rest leaks live creds (#190,#191).
- *Alternatives:* Document "bearer + short TTL only" — rejected: the `Provider` contract already carries `tx`; github/google validate it, magic-link must too (consistency).
- *Consequences:* Token store schema gains a hash column + state binding; migration note for sqlite store.

### D7 — Route every agent invocation (broadcast AND idle-trigger) through one per-copilot serialization queue with atomic preflight+charge; isolate untrusted text into a user-role message.
- *Decision:* Idle-trigger `runAgent` enters the same queue; budget reserves at preflight and reconciles on completion (single critical section); untrusted room text becomes a distinct user-role message, never concatenated into the system prompt.
- *Rationale:* Fixes budget TOCTOU/double-spend (#219,#223,#221) and prompt injection (#218, OWASP LLM01).
- *Alternatives:* Mutex per charge only — rejected: doesn't fix the queue-bypass path.
- *Consequences:* Idle and broadcast paths share ordering; budget accounting is consistent.

### D8 — Add a configurable upstream timeout/abort to all external `fetch` (STT/TTS), wired to the client abort signal; never reflect upstream error bodies.
- *Decision:* `signal: AbortSignal.timeout(cfg ?? 30s)`, link client abort to cancel upstream stream; map `AbortError` → 504; log upstream body, return generic message + correlation id.
- *Rationale:* Happy-path tests don't prove resilience (Rule: failure scenarios); an unbounded upstream hang ties up the handler (#211,#212,#214).
- *Alternatives:* Rely on platform fetch default timeout — rejected: not guaranteed across runtimes.
- *Consequences:* Deterministic 504 on upstream stall; failure tests become possible.

### D9 — Reduce flagged cyclomatic-complexity functions by extraction, preserving behavior under existing tests.
- *Decision:* Extract named helpers / early returns / dispatch tables to bring CC 16–24 functions toward ≤ 10, with no behavior change (existing tests stay green; characterization tests added where coverage is thin).
- *Rationale:* `architecture.md`/Clean Code maintainability; these are medium-severity (#182–#189).
- *Alternatives:* Leave as-is — rejected: user scoped all findings; but see Drawbacks (refactor risk).
- *Consequences:* More small functions; bound by the 500-LoC file budget.

## Drawbacks & Risks

| Drawback / Risk | Severity | Mitigation | Owner |
|---|---|---|---|
| `WebhookResult.error` shape change (D5) breaks consumers reading the raw error | Medium | Keep `code`+`message`; document in `@theokit/plugin-payments` CHANGELOG + changeset major/minor; provide migration note | payments owner |
| Magic-link token-store schema change (D6: hash + state) needs a migration for existing sqlite stores | Medium | Ship a forward migration; hash-on-read fallback for one release; document | auth owner |
| Reordering `markProcessed` after dispatch (D4) can double-dispatch if the store is the non-safe memory default | Medium | Pair with #202 fix (loud guard on memory store in prod) so multi-replica deployments must supply a real store | payments owner |
| Complexity refactors (D9) risk behavior regressions in under-tested functions | Medium | Add characterization tests BEFORE extracting; keep diffs mechanical; rely on existing + new tests | each pkg owner |
| Large blast radius (45 files, 9 phases) → long review | Medium | Phases are independently shippable; land P0/P1 (canvas/payments) first, then iterate; each phase has its own DoD | reviewer |
| Prompt-injection mitigation (D7) must change agent prompt formatting and shift outputs | Low | Snapshot/contract test on the assembled message structure, not exact model output | copilot owner |
| Adding timeouts (D8) must make slow-but-valid upstreams 504 | Low | Default 30s, configurable; document the knob | voice owner |

## Unresolved Questions

- Q1 — For D5, do any known host apps depend on the raw `WebhookResult.error` string? (consumers are out-of-repo; default to the narrowed shape + major changeset unless the owner says otherwise.)
- Q2 — For D6, is the magic-link store always sqlite/memory in practice, or do consumers plug custom stores that need the hash migration documented as a breaking interface change?
- Q3 — For D4, is the memory idempotency store ever used in multi-replica production today? (#202 makes it loud, but confirm no one relies on the silent single-flight loser semantics.)
- Q4 — For D8, what is the right default upstream timeout for TTS streamed bodies vs STT one-shot (30s assumed for both; TTS streaming must need longer)?

## Dependencies

This is a remediation plan; it adds **no new runtime dependencies** (Rule 9 — and D3 deliberately rejects a currency npm lib for the fixed, small zero-decimal set; integer-exact math uses built-ins/string handling).

| Package | Version | New? | Rule-9 justification | CVE status |
|---|---|---|---|---|
| (none — runtime) | — | no | All fixes use existing deps (DOMPurify, zod, stripe SDK, yjs already present) | n/a |
| `@react-email/render` (devDependency, OPTIONAL, plugin-email) | pinned to the version already declared as the optional peer in `plugin-email` | optional/dev | T8.1 must add it as a devDependency to test the happy path; it is ALREADY an optional peer of `@theokit/plugin-email` (no new production surface) | inherit peer; `pnpm audit` in Integration Validation confirms clean |

No production dependency is added, upgraded, or removed by this plan. `pnpm audit` runs in the Integration Validation chain as the standing CVE gate.

## Dependency Graph

```
Phase 1 (canvas-XSS)   ─┐
Phase 2 (payments)     ─┤
Phase 3 (auth)         ─┼─▶  (all independent; parallelizable per package)
Phase 4 (realtime)     ─┤
Phase 5 (voice)        ─┤
Phase 6 (copilot)      ─┘
Phase 7 (db/devtools/test-quality) ── independent
Phase 8 (email/forms test-quality) ── independent
Phase 9 (complexity)   ──▶ runs LAST per file (after that file's behavior fixes land, to avoid rebasing refactors)
                              │
                              ▼
Final Phase: Integration Validation (BLOCKS completion; runs after all phases)
```

Phases 1–8 are independent and can land in parallel PRs per package. Phase 9 (complexity) for a given file MUST run after that file's behavioral fixes (e.g., `sanitize.ts` #186 after #180/#179; `runtime.ts` is realtime/copilot specific) to avoid refactor/rebase churn. Integration Validation is the final blocking gate.

---

## Phase 1: Canvas — close the stored-XSS surface

**Objective:** Every artifact persistence path and every artifact kind passes `enforceArtifactSecurity`, with a DOMPurify-driven verdict.

### T1.1 — Enforce security on the REST create route (CRITICAL #176, test #229)

#### Objective
`POST /artifacts` rejects script-bearing artifacts exactly like the agent-tool path.

#### Why this step (action + reasoning)
1. **What:** call `enforceArtifactSecurity(validation.artifact)` in `route-handlers.create()` after `validateArtifact` and before `store.insert`, mapping `CanvasArtifactSecurityError` → HTTP 400.
2. **Why now:** this is the single CRITICAL finding (stored XSS, OWASP A03). The audit confirmed against HEAD `1d6611f` that the prior F2 fix (`64aa5a0`) refactored the function body but never wired it to the REST path (per ADR D1, Baseline row `route-handlers.ts`). It is the highest-risk, lowest-effort fix — do it first.

#### Evidence
`packages/plugin-canvas/src/route-handlers.ts:121` (`create()` runs only `validateArtifact` + `store.insert`); secured reference path at `packages/plugin-canvas/src/define-artifact-tool.ts:168`. Finding #176.

#### Files to edit
```
packages/plugin-canvas/src/route-handlers.ts — call enforceArtifactSecurity in create(); map error to 400
packages/plugin-canvas/tests/route-handlers.test.ts — RED test first (script SVG + meta-refresh HTML → 4xx)
```

#### Deep file dependency analysis
- `route-handlers.ts` today exposes `create/list/get`; `create` validates shape only. Add the security call; downstream `store.insert` now only ever sees safe artifacts. No signature change (preserves invariant). `enforceArtifactSecurity` already imported region/available from `schema.ts` (Baseline callers).

#### Deep Dives
- Invariant: a persisted artifact is ALWAYS security-checked (cite `route-handlers.ts` invariant cell).
- Edge cases: valid artifact unaffected (still 201); malformed shape still 400 from `validateArtifact`; security failure → 400 with `CanvasArtifactSecurityError.code`.

#### Pseudo-code / Signatures
```pseudocode
function create(req):
  validation = validateArtifact(req.body)
  if validation.error: return 400(validation.error)
  try: enforceArtifactSecurity(validation.artifact)
  catch CanvasArtifactSecurityError as e: return 400({code:e.code, message:e.message})
  inserted = store.insert(validation.artifact)
  return 201(inserted)
# input:  {kind:'svg', content:'<svg><script>…'}  -> 400 security
# input:  {kind:'code', content:'x=1'}            -> 201
```

#### Tasks
1. Add the RED test asserting a `<script>` SVG and a meta-refresh HTML POST return 4xx.
2. Insert `enforceArtifactSecurity` call + error mapping in `create()`.
3. Run the package test suite.

#### TDD
```
RED:  test_create_rejects_script_bearing_svg() — POST svg w/ <script> → 4xx security code (fails today)
RED:  test_create_rejects_meta_refresh_html()  — POST html w/ meta-refresh → 4xx
RED:  test_create_accepts_benign_code_artifact() — POST code → 201 (guards against over-blocking)
GREEN: wire enforceArtifactSecurity + 400 mapping in create()
REFACTOR: None expected
VERIFY: pnpm --filter @theokit/plugin-canvas test
```

#### Concurrency tests (only)

(none — single-threaded)

#### Acceptance Criteria
- [ ] Malicious POST returns 4xx; benign POST returns 201 — verified by `pnpm test` (exit 0) plus `pnpm typecheck` and `pnpm lint` (0 warnings).
- [ ] Pass: lint — `pnpm lint` zero warnings on changed files.
- [ ] Pass: coverage — `create()` security branch covered.
- [ ] Pass: size — `route-handlers.ts` ≤ 500 lines.

#### DoD
- [ ] `pnpm --filter @theokit/plugin-canvas test` green; `pnpm typecheck` clean; `pnpm lint` clean.

### T1.2 — Cover mermaid / slide-deck / image-data(svg+xml) in `enforceArtifactSecurity` (#178, test #230)

#### Objective
The security boundary explicitly handles (sanitizes or rejects) the kinds it currently skips.

#### Why this step
1. **What:** add explicit handling in `schema.ts` `enforceArtifactSecurity` for `image source=data` `svg+xml`, `mermaid`, and `slide-deck` — decode + sanitize svg+xml data URLs, reject embedded script.
2. **Why now:** D1 wires the gate everywhere; the gate must actually cover every script-capable kind, else T1.1 protects only svg/html. Baseline row `schema.ts`.

#### Evidence
`packages/plugin-canvas/src/schema.ts:265` — current enforcement covers svg/html only. Finding #178.

#### Files to edit
```
packages/plugin-canvas/src/schema.ts — extend enforceArtifactSecurity to mermaid/slide-deck/svg-data
packages/plugin-canvas/tests/schema.test.ts — RED cases for each new kind
```

#### Deep file dependency analysis
- `schema.ts` owns the boundary; adding cases is additive. `CanvasArtifactSecurityError` type unchanged (invariant). Callers (T1.1 route + define-artifact-tool) benefit automatically.

#### Deep Dives
- Decode `data:image/svg+xml;base64,…`, run through `sanitizeSvg`; if removals indicate script/handlers → reject.
- Edge cases: non-data image URLs (https) untouched; mermaid raw source checked for script injection vectors.

#### Tasks
1. RED cases: mermaid w/ script, `data:image/svg+xml` w/ `<script>`, slide-deck w/ embedded handler.
2. Implement per-kind handling.
3. Run suite.

#### TDD
```
RED: test_enforce_rejects_svg_data_url_with_script()
RED: test_enforce_rejects_mermaid_with_script_vector()
RED: test_enforce_handles_slide_deck_embedded_handler()
GREEN: extend enforceArtifactSecurity
REFACTOR: keep per-kind logic in small helpers (feeds D9)
VERIFY: pnpm --filter @theokit/plugin-canvas test
```

#### Concurrency tests

(none — single-threaded)

#### Acceptance Criteria
- [ ] Each script-capable kind is rejected when carrying script; benign variants pass — verified by `pnpm test` (exit 0) plus `pnpm typecheck` and `pnpm lint` (0 warnings).
- [ ] Pass: lint/size/coverage on `schema.ts`.

#### DoD
- [ ] canvas suite green; typecheck/lint clean.

### T1.3 — Sanitize mermaid SVG before `dangerouslySetInnerHTML` (#177, test #231)

#### Objective
Mermaid output passes `sanitizeSvg()` before reaching the DOM.

#### Why this step
1. **What:** in `mermaid-artifact.tsx`, pass `result.svg` through `sanitizeSvg()` before setting `__html`.
2. **Why now:** `securityLevel:'strict'` has documented bypasses; the SvgArtifact path already applies defense-in-depth, mermaid skips it. Baseline row `mermaid-artifact.tsx`.

#### Evidence
`packages/plugin-canvas/src/ui/renderers/mermaid-artifact.tsx:87`. Finding #177.

#### Files to edit
```
packages/plugin-canvas/src/ui/renderers/mermaid-artifact.tsx — sanitizeSvg(result.svg) before __html
packages/plugin-canvas/tests/artifact-renderer.test.tsx — RED: mermaid producing script SVG → no executable markup
```

#### Deep file dependency analysis
- Renderer imports `sanitizeSvg` from `sanitize.ts` (same dir). Presentational change; `securityLevel:'strict'` retained (invariant).

#### Deep Dives
- Edge: empty/failed mermaid render path unchanged; only the success `__html` is sanitized.

#### Tasks
1. RED test rendering a mermaid artifact whose diagram yields `<script>`/on-handler SVG; assert no executable markup in DOM.
2. Wrap with `sanitizeSvg`.
3. Run suite.

#### TDD
```
RED: test_mermaid_render_strips_script_svg()
GREEN: apply sanitizeSvg before dangerouslySetInnerHTML
REFACTOR: None expected
VERIFY: pnpm --filter @theokit/plugin-canvas test
```

#### Concurrency tests

(none — single-threaded)

#### Acceptance Criteria
- [ ] Script-bearing mermaid SVG is sanitized; valid diagrams still render — verified by `pnpm test` (exit 0) plus `pnpm typecheck` and `pnpm lint` (0 warnings).
- [ ] Pass: lint/size/coverage — verified by `pnpm test` (exit 0) plus `pnpm typecheck` and `pnpm lint` (0 warnings).

#### DoD
- [ ] canvas suite green; typecheck/lint clean.

### T1.4 — DOMPurify-driven verdict + remove post-sanitize regex (#180, #179)

#### Objective
`sanitize.ts` decides the security verdict from DOMPurify removals and drops the post-sanitize regex mutate.

#### Why this step
1. **What:** drive `classifyRemovals` off DOMPurify `removed[]`/hooks; enforce URL policy via `ALLOWED_URI_REGEXP` + `uponSanitizeAttribute`; delete the `sanitize.ts:84-95` regex pass.
2. **Why now:** per D2 — the regex diff verdict is lossy (#180) and the post-hoc regex can re-introduce markup (#179). Baseline row `sanitize.ts`.

#### Evidence
`packages/plugin-canvas/src/ui/renderers/sanitize.ts:43` (lossy verdict), `:84` (regex mutate). Findings #180, #179.

#### Files to edit
```
packages/plugin-canvas/src/ui/renderers/sanitize.ts — verdict from removed[]; remove regex pass; URL policy via DOMPurify config
packages/plugin-canvas/tests/schema.test.ts (and/or sanitize-specific test) — RED cases
```

#### Deep file dependency analysis
- `sanitizeSvg`/`sanitizeHtml` public signatures unchanged (invariant); internal verdict mechanism changes. `classifyRemovals` consumers (boundary reject) get exact removals.

#### Deep Dives
- Configure DOMPurify with `ALLOWED_URI_REGEXP` for https/data-image; `uponSanitizeAttribute` to drop `javascript:`/event handlers; collect `removed[]` for the verdict.
- Edge: legitimate markup that DOMPurify keeps → no removal → pass; any removed node → security verdict reject.

#### Tasks
1. RED: input whose only change is a stripped `javascript:` href → verdict reject; benign input → pass with byte-identical safe output.
2. Replace regex verdict + delete post-regex mutate; add DOMPurify hooks/config.
3. Run suite.

#### TDD
```
RED: test_verdict_rejects_when_dompurify_removes_script_attr()
RED: test_benign_markup_passes_without_mutation()
GREEN: removed[]-driven verdict + URI policy; delete regex pass
REFACTOR: extract classifyRemovals helpers (sets up #186 in Phase 9)
VERIFY: pnpm --filter @theokit/plugin-canvas test
```

#### Concurrency tests

(none — single-threaded)

#### Acceptance Criteria
- [ ] Verdict matches DOMPurify removals; no regex pass remains — verified by `pnpm test` (exit 0) plus `pnpm typecheck` and `pnpm lint` (0 warnings).
- [ ] Pass: lint/size/coverage — verified by `pnpm test` (exit 0) plus `pnpm typecheck` and `pnpm lint` (0 warnings).

#### DoD
- [ ] canvas suite green; typecheck/lint clean.

### T1.5 — Remove pointless try/catch in `define-artifact-tool` (#181)

#### Objective
Delete the immediate re-throw try/catch.

#### Why this step
1. **What:** call `enforceArtifactSecurity(artifact)` directly at `define-artifact-tool.ts:168`, removing the try/catch that catches and re-throws unchanged.
2. **Why now:** dead error-handling adds noise (Rule 8: don't log-and-rethrow / no-op catch); trivial and isolated. Baseline row `define-artifact-tool.ts`.

#### Evidence
`packages/plugin-canvas/src/define-artifact-tool.ts:168`. Finding #181.

#### Files to edit
```
packages/plugin-canvas/src/define-artifact-tool.ts — remove try/catch; direct call
```

#### Deep file dependency analysis
- Behavior identical (the catch re-threw unchanged). Existing `define-artifact-tool.test.ts` must stay green (characterization).

#### Deep Dives
- Edge: the thrown `CanvasArtifactSecurityError` still propagates to the agent-tool caller exactly as before.

#### Tasks
1. Confirm existing tests cover the throw path (add a characterization assert if missing).
2. Remove the try/catch.
3. Run suite.

#### TDD
```
RED: test_define_artifact_tool_propagates_security_error() — (characterization)  — exists/added, stays green
GREEN: remove try/catch
REFACTOR: None expected
VERIFY: pnpm --filter @theokit/plugin-canvas test
```

#### Concurrency tests

(none — single-threaded)

#### Acceptance Criteria
- [ ] try/catch removed; error still propagates; tests green — verified by `pnpm test` (exit 0) plus `pnpm typecheck` and `pnpm lint` (0 warnings).

#### DoD
- [ ] canvas suite green; typecheck/lint clean.

---

## Phase 2: Payments — money correctness & exactly-once

**Objective:** Stripe amounts are exact; webhook delivery is exactly-once with sanitized errors.

### T2.1 — Code-keyed zero-decimal detection + integer-exact conversion (#200, #199, test #225)

#### Objective
`formatAmountForStripe` returns correct integer minor units for every currency/amount.

#### Why this step
1. **What:** detect zero-decimal currencies from Stripe's static code set; compute minor units without binary-float scaling; assert `Number.isInteger`.
2. **Why now:** P0 money defect — whole-number USD is undercharged 100× (#200) and `amount*100` is lossy (#199). Per ADR D3. Baseline row `currency.ts`.

#### Evidence
`packages/plugin-payments/src/currency.ts:22` (amount-dependent detection), `:29` (float multiply). Findings #200, #199.

#### Files to edit
```
packages/plugin-payments/src/currency.ts — static zero-decimal set; integer-exact conversion; Number.isInteger assert
packages/plugin-payments/tests/checkout.test.ts — RED contract tests
```

#### Deep file dependency analysis
- `formatAmountForStripe` is called by `checkout.ts` (Baseline callers); return contract (integer cents) preserved; only correctness changes.

#### Deep Dives
- Zero-decimal set (Stripe): BIF, CLP, DJF, GNF, JPY, KMF, KRW, MGA, PYG, RWF, UGX, VND, VUV, XAF, XOF, XPF (+ others per docs).
- Convert: for 2-decimal, `Math.round(amount*100)` → replace with integer-safe (e.g., parse to cents via string or a small decimal helper); for zero-decimal, return `amount` after `Number.isInteger` assertion (throw on non-integer).
- Edge: 0 → 0; 99.99 USD → 9999; 10 USD → 1000; 1.005 rounding documented; negative amount contract decided (reject).

#### Pseudo-code / Signatures
```pseudocode
ZERO_DECIMAL = Set("jpy","krw","vnd", ...)  // Stripe published list
function formatAmountForStripe(amount, currency) -> integer:
  c = currency.toLowerCase()
  if ZERO_DECIMAL.has(c):
    assert Number.isInteger(amount)  // throw otherwise
    return amount
  return integerCents(amount)  // string/decimal-safe, not amount*100 float
# formatAmountForStripe(10,'USD') -> 1000 ; (1500,'usd') -> 150000 ; (100,'jpy') -> 100
```

#### Tasks
1. RED: `(10,'USD')==1000`, `(0,'USD')==0`, `(99.99,'USD')==9999`, `(100,'JPY')==100`, negative → documented behavior.
2. Implement static set + integer conversion + assertion.
3. Run suite.

#### TDD
```
RED: test_usd_whole_number_is_major_units_x100()   // 10 -> 1000 (fails today: 100x undercharge)
RED: test_usd_fractional_exact()                    // 99.99 -> 9999
RED: test_jpy_zero_decimal_passthrough_integer()    // 100 -> 100
RED: test_jpy_non_integer_throws()
GREEN: code-keyed detection + integer-exact conversion
REFACTOR: None expected
VERIFY: pnpm --filter @theokit/plugin-payments test
```

#### Concurrency tests

(none — single-threaded)

#### Acceptance Criteria
- [ ] All currency/amount contract tests pass; no float scaling remains — verified by `pnpm test` (exit 0) plus `pnpm typecheck` and `pnpm lint` (0 warnings).
- [ ] Pass: lint/size/coverage (currency.ts critical-path 100%) — verified by `pnpm test` (exit 0) plus `pnpm typecheck` and `pnpm lint` (0 warnings).

#### DoD
- [ ] payments suite green; typecheck/lint clean; CHANGELOG note (bugfix) added.

### T2.2 — Mark webhook processed only after successful dispatch (#167, test #226)

#### Objective
A throwing handler leaves the event un-marked so Stripe retries.

#### Why this step
1. **What:** reorder `processWebhook` so `markProcessed` runs AFTER `dispatch` succeeds; return non-2xx on handler failure.
2. **Why now:** P0 — current order delivers at-most-once and silently drops events on transient failure (#167). Per ADR D4. Baseline row `webhook.ts`.

#### Evidence
`packages/plugin-payments/src/webhook.ts:191` (mark before dispatch at `:196`). Finding #167.

#### Files to edit
```
packages/plugin-payments/src/webhook.ts — reorder mark-after-success; non-2xx on failure
packages/plugin-payments/tests/webhook.test.ts — RED: throwing handler invoked on both deliveries
```

#### Deep file dependency analysis
- `processWebhook`/`WebhookResult` are public (Baseline callers). Ordering change preserves signature verification path (invariant). Pairs with T2.4 (memory-store guard) per Drawbacks.

#### Deep Dives
- Invariant: `markProcessed(event.id)` happens iff dispatch did not throw.
- Edge: duplicate of an already-successfully-processed event → still `{duplicate:true}`; duplicate after a failed (unmarked) event → re-runs handler.

#### Tasks
1. RED: handler throws; call `processWebhook` twice with same signed payload; assert handler invoked on BOTH (event not marked after throw).
2. Reorder mark/dispatch; return failure status on throw.
3. Run suite.

#### TDD
```
RED: test_throwing_handler_leaves_event_unmarked_and_retried()
RED: test_successful_handler_marks_once_and_dedupes()
RED: test_partial_failure_documents_handler_idempotency_requirement()  -- EC-3: A ok + B throws → retry re-runs; assert idempotency contract / per-handler effect
GREEN: mark-after-success ordering + failure status
REFACTOR: None expected
VERIFY: pnpm --filter @theokit/plugin-payments test
```

#### Concurrency tests (applicable — idempotency under concurrent deliveries)

Atomic-claim invariant: fire N concurrent processWebhook() with the SAME signed event id against a store that claims atomically; assert the handler runs at most once on success and the single-flight loser does not mark a not-yet-succeeded event. (Vitest: Promise.all over N deliveries; assert handler call count.)

Race-aware test: happens-before observation via an explicit barrier (Promise.all / deferred), asserting the post-barrier invariant; single-threaded execution cannot reproduce the interleaving.

#### Acceptance Criteria
- [ ] Throwing handler → retried; successful → deduped once — verified by `pnpm test` (exit 0) plus `pnpm typecheck` and `pnpm lint` (0 warnings).
- [ ] Pass: lint/size/coverage (webhook critical path 100%) — verified by `pnpm test` (exit 0) plus `pnpm typecheck` and `pnpm lint` (0 warnings).

#### DoD
- [ ] payments suite green; typecheck/lint clean.

### T2.3 — Aggregate handler errors + sanitize the public error (#208, #201)

#### Objective
Dispatch fails fast or aggregates; the HTTP boundary never sees raw errors.

#### Why this step
1. **What:** `WebhookRegistry.dispatch` aggregates handler errors (`AggregateError`) instead of running-all-then-rethrowing-first + `console.error`-swallowing; `processWebhook` returns a sanitized `{code,message}` (D5), logging the full error via a redacting logger.
2. **Why now:** partial side effects + lost errors + secret leakage are money/PII hazards (#208,#201). Per ADR D4/D5.

#### Evidence
`packages/plugin-payments/src/webhook.ts:95` (dispatch), `:198` (raw error in result). Findings #208, #201.

#### Files to edit
```
packages/plugin-payments/src/webhook.ts — AggregateError in dispatch; sanitized error boundary + redacting log
packages/plugin-payments/tests/webhook.test.ts — RED: multi-error aggregation; RED: no raw error in WebhookResult
.changeset/payments-webhook-error-shape.md (NEW) — EC-4: semver bump describing the WebhookResult.error narrowing (public-contract change, D5)
```

#### Deep file dependency analysis
- `WebhookResult.error` shape narrows (public-contract change, D5) → CHANGELOG/changeset. `dispatch` LIFO/run-order behavior otherwise preserved (existing tests).

#### Deep Dives
- Edge: single handler error → still surfaced (as aggregate of one or fail-fast); zero handlers → unchanged.

#### Tasks
1. RED: two handlers throw → both errors surfaced (not just first); `WebhookResult.error` contains only `{code,message}` (no stack/secret).
2. Implement aggregation + sanitized boundary + redacting log.
3. Run suite.

#### TDD
```
RED: test_dispatch_surfaces_all_handler_errors()
RED: test_webhook_result_error_is_sanitized()
GREEN: AggregateError + sanitized {code,message}
REFACTOR: None expected
VERIFY: pnpm --filter @theokit/plugin-payments test
```

#### Concurrency tests

(none — handlers dispatched sequentially; concurrency covered in T2.2)

Race-aware test: happens-before observation via an explicit barrier (Promise.all / deferred), asserting the post-barrier invariant; single-threaded execution cannot reproduce the interleaving.

#### Acceptance Criteria
- [ ] All handler errors surfaced; no raw error/secret on the public boundary — verified by `pnpm test` (exit 0) plus `pnpm typecheck` and `pnpm lint` (0 warnings).
- [ ] Pass: lint/size/coverage — verified by `pnpm test` (exit 0) plus `pnpm typecheck` and `pnpm lint` (0 warnings).

#### DoD
- [ ] payments suite green; typecheck/lint clean; CHANGELOG note for the error-shape change.

### T2.4 — Make the memory idempotency store loud in production (#202)

#### Objective
A multi-replica deployment cannot silently use the non-safe default store.

#### Why this step
1. **What:** the default `createMemoryStore` throws/warns loudly at register-time when `NODE_ENV==='production'` and no explicit `idempotencyStore` was supplied; document the single-flight loser semantics.
2. **Why now:** D4 reordering makes a real store important; the silent default risks double-fulfillment across replicas (#202). Baseline row `idempotency-store.ts`.

#### Evidence
`packages/plugin-payments/src/idempotency-store.ts:47`; default wired at `index.ts:84`. Finding #202.

#### Files to edit
```
packages/plugin-payments/src/idempotency-store.ts — document/guard single-flight semantics
packages/plugin-payments/src/index.ts — loud guard in production when default used
packages/plugin-payments/tests/webhook.test.ts (or new) — RED: production + default store → warn/throw
```

#### Deep file dependency analysis
- `IdempotencyStore` interface unchanged (invariant); only the default-selection path gains a guard.

#### Deep Dives
- Edge: dev/test default still works silently; production default → loud.

#### Tasks
1. RED: simulate `NODE_ENV=production` + no store → guard fires.
2. Implement guard + docs.
3. Run suite.

#### TDD
```
RED: test_production_default_idempotency_store_is_loud()
GREEN: register-time guard
REFACTOR: None expected
VERIFY: pnpm --filter @theokit/plugin-payments test
```

#### Concurrency tests

(none — single-threaded)

#### Acceptance Criteria
- [ ] Production + default store warns/throws; explicit store unaffected — verified by `pnpm test` (exit 0) plus `pnpm typecheck` and `pnpm lint` (0 warnings).

#### DoD
- [ ] payments suite green; typecheck/lint clean.

### T2.5 — Validate Stripe `apiVersion` instead of blind cast (#210)

#### Objective
`apiVersion` is validated, not cast via `as`.

#### Why this step
1. **What:** validate `opts.apiVersion` against accepted versions at runtime (or narrow the type) instead of `as Stripe.LatestApiVersion`.
2. **Why now:** the blind cast defeats type safety (#210); low effort. Baseline row `stripe-client.ts`.

#### Evidence
`packages/plugin-payments/src/stripe-client.ts:46`. Finding #210.

#### Files to edit
```
packages/plugin-payments/src/stripe-client.ts — runtime validate / narrow apiVersion
packages/plugin-payments/tests/checkout.test.ts (or stripe-client test) — RED: invalid apiVersion rejected
```

#### Deep file dependency analysis
- Client factory only; no public-surface change beyond stricter input validation.

#### Deep Dives
- Edge: unset apiVersion → SDK default; invalid → clear error.

#### Tasks
1. RED: invalid apiVersion → throws a clear error.
2. Implement validation/narrowing.
3. Run suite.

#### TDD
```
RED: test_invalid_api_version_rejected()
GREEN: validate/narrow apiVersion
REFACTOR: None expected
VERIFY: pnpm --filter @theokit/plugin-payments test
```

#### Concurrency tests

(none — single-threaded)

#### Acceptance Criteria
- [ ] Invalid apiVersion rejected; valid accepted — verified by `pnpm test` (exit 0) plus `pnpm typecheck` and `pnpm lint` (0 warnings).

#### DoD
- [ ] payments suite green; typecheck/lint clean.

---

## Phase 3: Auth — hardening

**Objective:** Magic-link is CSRF-bound + hashed + DoS-capped; Google OIDC SSRF-gated; GitHub email failure surfaced.

### T3.1 — Magic-link CSRF binding + token hashing (#190, #191)

#### Objective
Tokens are bound to their issuing transaction and stored hashed.

#### Why this step
1. **What:** persist `tx.state`/nonce at `startSignIn`, require it to match in `handleCallback` (stop ignoring `_tx`); store only `sha256(token)`.
2. **Why now:** HIGH — unbound bearer tokens enable replay/login-CSRF (#190); plaintext-at-rest leaks live creds (#191). Per ADR D6. Baseline rows `index.ts`, `store.ts`.

#### Evidence
`packages/auth-magic-link/src/index.ts:144` (`_tx` ignored), `store.ts:31` (plaintext). Findings #190, #191.

#### Files to edit
```
packages/auth-magic-link/src/index.ts — bind + validate tx.state in handleCallback
packages/auth-magic-link/src/store.ts — store/look-up by sha256(token)
packages/auth-magic-link/tests/*.test.ts — RED: state mismatch rejected; RED: store holds no plaintext
.changeset/auth-magic-link-store-schema.md (NEW) — EC-4: semver bump describing the token-store schema change (hash + state binding, D6)
```

#### Deep file dependency analysis
- `Provider` contract already carries `tx` (github/google validate it — Baseline callers); aligning magic-link is consistency, not a signature change. Store schema gains a hash (migration note, Drawbacks).

#### Deep Dives
- Invariant: a token is single-use, TTL-bounded, AND state-bound; lookup is by hash.
- Edge: legacy plaintext rows → hash-on-read fallback for one release (Drawbacks Q2).

#### Tasks
1. RED: callback with mismatched/absent state → reject; store inspection shows only hashes.
2. Implement state binding + hashing + fallback.
3. Run suite.

#### TDD
```
RED: test_callback_rejects_state_mismatch()
RED: test_store_persists_only_token_hash()
RED: test_valid_state_single_use_consume_succeeds()
GREEN: bind+validate state; hash at rest
REFACTOR: None expected
VERIFY: pnpm --filter @theokit/auth-magic-link test
```

#### Concurrency tests (applicable — single-use under concurrent consume)

Atomic single-use: two concurrent consumeToken() for the same token → exactly one succeeds, the other is rejected (no double-consume). Vitest Promise.all on the store.

Race-aware test: happens-before observation via an explicit barrier (Promise.all / deferred), asserting the post-barrier invariant; single-threaded execution cannot reproduce the interleaving.

#### Acceptance Criteria
- [ ] State mismatch rejected; only hashes at rest; single-use preserved — verified by `pnpm test` (exit 0) plus `pnpm typecheck` and `pnpm lint` (0 warnings).
- [ ] Pass: lint/size/coverage (critical path 100%) — verified by `pnpm test` (exit 0) plus `pnpm typecheck` and `pnpm lint` (0 warnings).

#### DoD
- [ ] auth-magic-link suite green; typecheck/lint clean; migration note + CHANGELOG.

### T3.2 — Magic-link body cap + narrowed catch + URL join (#204, #209, #205)

#### Objective
`defaultResolveEmail` is DoS-capped and fails cleanly; sign-in URL join is correct.

#### Why this step
1. **What:** cap accumulated body (~16KB → reject), narrow the catch to JSON parse errors (let stream/transport errors propagate/log), and normalize the callback URL join (`new URL(callbackPath, base)` + validate base at init).
2. **Why now:** unbounded body is a DoS (#204), catch-all hides transport errors (#209), and the URL join ignores the resolved default (#205). Baseline row `index.ts`.

#### Evidence
`index.ts:69` (#204), `:84` (#209), `:130` (#205).

#### Files to edit
```
packages/auth-magic-link/src/index.ts — body cap, narrowed catch, URL join + base validation
packages/auth-magic-link/tests/*.test.ts — RED for each
```

#### Deep file dependency analysis
- `defaultResolveEmail`/`startSignIn` behavior tightened; `Provider` signatures unchanged.

#### Deep Dives
- Edge: body exactly at cap; malformed JSON → null/400; transport error → propagate; base URL with trailing slash.

#### Tasks
1. RED: oversized body rejected; transport error propagates; URL join correct with default callbackPath.
2. Implement cap + narrowed catch + `new URL` join + init validation.
3. Run suite.

#### TDD
```
RED: test_resolve_email_rejects_oversized_body()
RED: test_resolve_email_propagates_transport_error()
RED: test_signin_url_uses_resolved_callback_path()
GREEN: implement all three
REFACTOR: None expected
VERIFY: pnpm --filter @theokit/auth-magic-link test
```

#### Concurrency tests

(none — single-threaded)

#### Acceptance Criteria
- [ ] Oversized body rejected; transport errors visible; URL correct — verified by `pnpm test` (exit 0) plus `pnpm typecheck` and `pnpm lint` (0 warnings).

#### DoD
- [ ] auth-magic-link suite green; typecheck/lint clean.

### T3.3 — Google OIDC base-URL SSRF gating (#192)

#### Objective
The OIDC base URL override cannot be abused as an SSRF vector.

#### Why this step
1. **What:** gate the env override behind an explicit build-time test flag (not runtime `NODE_ENV`), require `https://` on `oidcBaseUrl`, and validate discovered endpoint hosts against the configured base host.
2. **Why now:** runtime env override + no allowlist is an SSRF surface (#192). Baseline row `auth-google/src/index.ts`.

#### Evidence
`packages/auth-google/src/index.ts:44`. Finding #192.

#### Files to edit
```
packages/auth-google/src/index.ts — test-flag gating, https requirement, host validation
packages/auth-google/tests/*.test.ts — RED: non-https rejected; RED: cross-host discovery rejected
```

#### Deep file dependency analysis
- OIDC flow/state/PKCE unchanged (invariant); only override path is hardened.

#### Deep Dives
- Edge: production never honors env override; discovered endpoints on a different host → reject.

#### Tasks
1. RED: `http://` base rejected; discovery host ≠ base host rejected; prod ignores env override.
2. Implement gating + validation.
3. Run suite.

#### TDD
```
RED: test_non_https_oidc_base_rejected()
RED: test_cross_host_discovery_rejected()
RED: test_production_ignores_env_override()
GREEN: implement gating/validation
REFACTOR: None expected
VERIFY: pnpm --filter @theokit/auth-google test
```

#### Concurrency tests

(none — single-threaded)

#### Acceptance Criteria
- [ ] Only https same-host discovery accepted; prod ignores env override — verified by `pnpm test` (exit 0) plus `pnpm typecheck` and `pnpm lint` (0 warnings).

#### DoD
- [ ] auth-google suite green; typecheck/lint clean.

### T3.4 — GitHub provider: surface `/user/emails` failure (#203)

#### Objective
A failed email fetch is observable, not silently a null-email identity.

#### Why this step
1. **What:** on `emailsRes !ok`, log/emit a metric and (when email scope was granted) fail the callback so the caller decides, rather than returning a null-email identity.
2. **Why now:** silent swallow yields broken identities (#203, Rule 8). Baseline row `auth-github/src/index.ts`.

#### Evidence
`packages/auth-github/src/index.ts:165`. Finding #203.

#### Files to edit
```
packages/auth-github/src/index.ts — handle emails fetch failure
packages/auth-github/tests/*.test.ts — RED: emails failure surfaced
```

#### Deep file dependency analysis
- `Provider` callback contract preserved; failure path now explicit.

#### Deep Dives
- Edge: user genuinely has no public email vs fetch failed — distinguish (failure → error/metric; legitimately-null → documented).

#### Tasks
1. RED: emails endpoint returns non-ok → callback errors/metrics (not null-email success).
2. Implement handling.
3. Run suite.

#### TDD
```
RED: test_github_emails_failure_is_surfaced()
GREEN: handle non-ok emails response
REFACTOR: None expected
VERIFY: pnpm --filter @theokit/auth-github test
```

#### Concurrency tests

(none — single-threaded)

#### Acceptance Criteria
- [ ] Emails failure surfaced; happy path unchanged — verified by `pnpm test` (exit 0) plus `pnpm typecheck` and `pnpm lint` (0 warnings).

#### DoD
- [ ] auth-github suite green; typecheck/lint clean.

---

## Phase 4: Realtime — concurrency correctness

**Objective:** Yjs doc creation/apply is race-free; the server bridge aborts cleanly with a bounded queue.

### T4.1 — `ensureYjs` in-flight memoization + return bundle (#193, #196, test #234)

#### Objective
Concurrent room joins share one `Y.Doc`; callers don't re-invoke `loadYjs()`.

#### Why this step
1. **What:** memoize creation with an in-flight promise per room (`state.docInit?: Promise<…>`); assign synchronously after the single `await`; return `{doc,awareness,yjs,awMod}` so callers stop re-calling `loadYjs()`.
2. **Why now:** HIGH check-then-act race orphans a duplicate `Y.Doc` (#193) and there's a redundant `loadYjs()` (#196). Baseline row `yjs-provider.ts`.

#### Evidence
`packages/plugin-realtime/src/yjs-provider.ts:148` (race), `:256/:270` (redundant load). Findings #193, #196.

#### Files to edit
```
packages/plugin-realtime/src/yjs-provider.ts — in-flight promise memoization + return bundle
packages/plugin-realtime/tests/yjs-provider.test.ts — RED: concurrent join shares one doc
```

#### Deep file dependency analysis
- `RealtimeProvider` interface stable (invariant); internal creation path changes. Callers within the file use the returned bundle.

#### Deep Dives
- Invariant: exactly one `Y.Doc`/`Awareness` per room id; no orphaned doc; `destroy()` called on teardown only.
- Edge: second caller arriving mid-`await` awaits the same promise.

#### Tasks
1. RED: `Promise.all([joinRoom(room,c1), joinRoom(room,c2)])` on a fresh room → both share one doc (update from c1 visible to c2; presence merges).
2. Implement in-flight memoization + return bundle; remove redundant `loadYjs`.
3. Run suite.

#### TDD
```
RED: test_concurrent_join_shares_single_ydoc()
RED: test_failed_doc_init_clears_memo_and_allows_retry()  -- EC-1: if loadYjs() rejects, state.docInit is reset so a later join can recreate (no permanently bricked room)
GREEN: in-flight promise + synchronous assign + return bundle; on reject `catch (e){ state.docInit = undefined; throw e }`
REFACTOR: remove redundant loadYjs callers
VERIFY: pnpm --filter @theokit/plugin-realtime test
```

#### Concurrency tests (applicable)

Happens-before / single-doc invariant: barrier with Promise.all over N concurrent joinRoom on the SAME fresh room id; assert exactly one Y.Doc instance is created (spy on Doc constructor / assert identity) and an update from one connection is observed by all others. This is the only proof the check-then-act race is closed — single-thread TDD always interleaves cleanly.

Race-aware test: happens-before observation via an explicit barrier (Promise.all / deferred), asserting the post-barrier invariant; single-threaded execution cannot reproduce the interleaving.

#### Acceptance Criteria
- [ ] Concurrent joins share one doc; no orphan; no redundant loadYjs — verified by `pnpm test` (exit 0) plus `pnpm typecheck` and `pnpm lint` (0 warnings).
- [ ] Pass: lint/size/coverage — verified by `pnpm test` (exit 0) plus `pnpm typecheck` and `pnpm lint` (0 warnings).

#### DoD
- [ ] realtime suite green; typecheck/lint clean.

### T4.2 — Guard `applyYjsUpdate` against destroyed/GC'd docs (#194)

#### Objective
An update after room GC does not apply to a destroyed doc.

#### Why this step
1. **What:** re-validate room membership after awaits; refcount in-flight ops (or skip GC while a doc has pending applies) so a doc isn't destroyed mid-operation.
2. **Why now:** HIGH — applying to a GC'd doc after `await` throws/corrupts (#194). Baseline row `yjs-provider.ts`.

#### Evidence
`packages/plugin-realtime/src/yjs-provider.ts:253-257`. Finding #194.

#### Files to edit
```
packages/plugin-realtime/src/yjs-provider.ts — post-await membership/destroyed guard + in-flight refcount
packages/plugin-realtime/tests/yjs-provider.test.ts — RED: apply after leave/GC is a safe no-op
```

#### Deep file dependency analysis
- Internal to provider; interface stable.

#### Deep Dives
- Invariant: no apply to a destroyed doc; GC deferred while ops in flight.

#### Tasks
1. RED: apply an update after `leaveRoom` GCs the doc → no throw, no apply to destroyed doc.
2. Implement refcount/guard.
3. Run suite.

#### TDD
```
RED: test_apply_after_gc_is_safe_noop()
GREEN: post-await guard + in-flight refcount
REFACTOR: None expected
VERIFY: pnpm --filter @theokit/plugin-realtime test
```

#### Concurrency tests (applicable)

Cancellation/ordering: start applyYjsUpdate, trigger leaveRoom (GC) concurrently, resolve the apply last; assert no operation hits a destroyed doc and no exception escapes. Barrier-coordinated to force the post-await window.

Race-aware test: happens-before observation via an explicit barrier (Promise.all / deferred), asserting the post-barrier invariant; single-threaded execution cannot reproduce the interleaving.

#### Acceptance Criteria
- [ ] Apply after GC is safe; in-flight ops block GC — verified by `pnpm test` (exit 0) plus `pnpm typecheck` and `pnpm lint` (0 warnings).

#### DoD
- [ ] realtime suite green; typecheck/lint clean.

### T4.3 — server-integration: abort handling + bounded queue (#195, #198, test #235)

#### Objective
A mid-stream abort releases the connection handle and stops enqueuing; the queue is bounded.

#### Why this step
1. **What:** check `ctx.signal.aborted` before/after `handleConnection` (or register the abort listener before the `await`); guard `onFrame` with `if (stopped) return`; cap the queue (drop-oldest or disconnect on overflow).
2. **Why now:** HIGH connection-handle + listener leak per dropped connection + unbounded queue DoS (#195); frames enqueued after abort (#198). Baseline row `server-integration.ts`.

#### Evidence
`server-integration.ts:209/183` (#195), `:187` (#198). NEW test file needed.

#### Files to edit
```
packages/plugin-realtime/src/internal/server-integration.ts — pre-await abort check, stopped-guard, queue cap
packages/plugin-realtime/tests/server-integration.test.ts (NEW) — RED: abort releases handle + stops enqueue + bounded
```

#### Deep file dependency analysis
- Internal bridge; no public-surface change. NEW test file (Baseline NEW row) — co-located under `tests/`, picked up by `vitest run`.

#### Deep Dives
- Invariant: after abort, no new frames enqueued; handle released exactly once; queue length ≤ cap.
- Edge: abort BEFORE `handleConnection` resolves (`{once:true}` won't fire on already-aborted signal) — register listener first or check `aborted`.

#### Tasks
1. RED (new file): simulate client abort mid-stream → (a) handle released, (b) onFrame stops enqueuing, (c) queue does not grow unbounded.
2. Implement abort check + stopped-guard + cap.
3. Run suite.

#### TDD
```
RED: test_abort_releases_connection_handle()
RED: test_onframe_stops_after_abort()
RED: test_queue_is_bounded_under_flood()
GREEN: pre-await abort check + stopped guard + cap
REFACTOR: None expected
VERIFY: pnpm --filter @theokit/plugin-realtime test
```

#### Concurrency tests (applicable)

Cancellation propagation: abort the ctx during the await window of handleConnection; assert release() runs exactly once and the generator stops (no infinite waiter). Flood N frames post-abort; assert queue length capped and no growth.

#### Acceptance Criteria
- [ ] Abort releases handle once; no post-abort enqueue; queue bounded — verified by `pnpm test` (exit 0) plus `pnpm typecheck` and `pnpm lint` (0 warnings).
- [ ] Pass: lint/size/coverage — verified by `pnpm test` (exit 0) plus `pnpm typecheck` and `pnpm lint` (0 warnings).

#### DoD
- [ ] realtime suite green; typecheck/lint clean.

### T4.4 — Fail loudly when a yjs-storage room lacks provider support (#197)

#### Objective
A `storage:"yjs"` room with a provider missing `applyYjsUpdate` errors instead of silently dropping frames.

#### Why this step
1. **What:** throw a configuration error (or `log.warn` once) at mount/dispatch when the descriptor declares `storage:"yjs"` but the provider lacks `applyYjsUpdate`.
2. **Why now:** silent drop hides misconfiguration (#197, Rule 8). Baseline row `internal/runtime.ts`.

#### Evidence
`packages/plugin-realtime/src/internal/runtime.ts:194-206`. Finding #197.

#### Files to edit
```
packages/plugin-realtime/src/internal/runtime.ts — config error/warn on missing yjs support
packages/plugin-realtime/tests/*.test.ts — RED: misconfig surfaces
```

#### Deep file dependency analysis
- Dispatch path only; no public-surface change.

#### Deep Dives
- Edge: provider WITH support → unchanged; without → error/warn-once.

#### Tasks
1. RED: yjs room + unsupported provider → error/warn.
2. Implement check.
3. Run suite.

#### TDD
```
RED: test_yjs_room_without_provider_support_errors()
GREEN: config check at mount/dispatch
REFACTOR: None expected
VERIFY: pnpm --filter @theokit/plugin-realtime test
```

#### Concurrency tests

(none — single-threaded)

#### Acceptance Criteria
- [ ] Misconfig surfaces; supported path unchanged — verified by `pnpm test` (exit 0) plus `pnpm typecheck` and `pnpm lint` (0 warnings).

#### DoD
- [ ] realtime suite green; typecheck/lint clean.

---

## Phase 5: Voice — resilience & races

**Objective:** STT/TTS upstream fetch is timeout/abort-safe; recorder/UI errors and races handled; upstream bodies not reflected.

### T5.1 — STT/TTS upstream timeout/abort (#211, #212, test #236)

#### Objective
Both handlers abort on upstream stall and map to 504.

#### Why this step
1. **What:** pass `signal: AbortSignal.timeout(cfg ?? 30s)` to `fetch`; wire the client request abort to cancel the upstream (TTS streamed) body; map `AbortError` → 504 `UPSTREAM_TIMEOUT`.
2. **Why now:** HIGH — an unbounded upstream hang ties up the handler (#211,#212). Per ADR D8. Baseline rows `stt-server.ts`, `tts-server.ts`.

#### Evidence
`stt-server.ts:105` (#211), `tts-server.ts:96` (#212).

#### Files to edit
```
packages/plugin-voice/src/stt-server.ts — AbortSignal.timeout + 504 mapping
packages/plugin-voice/src/tts-server.ts — AbortSignal.timeout + client-abort→upstream cancel + 504
packages/plugin-voice/tests/stt-server.test.ts — RED: never-resolving fetch → 504; signal provided
```

#### Deep file dependency analysis
- `fetchImpl` injected (DIP — Baseline callers); adding a `timeoutMs` option is additive. Handler signatures stable (invariant).

#### Deep Dives
- Edge: upstream resolves just under timeout → success; client aborts → upstream stream cancelled.

#### Tasks
1. RED: `fetchImpl` that never resolves (fake timers) → 504 `UPSTREAM_TIMEOUT`; assert `init.signal` provided; TTS streamed-body cancels on abort.
2. Implement timeout/abort wiring.
3. Run suite.

#### TDD
```
RED: test_stt_times_out_with_504_and_signal()
RED: test_tts_times_out_and_cancels_stream_on_abort()
GREEN: AbortSignal.timeout + client-abort wiring + 504
REFACTOR: None expected
VERIFY: pnpm --filter @theokit/plugin-voice test
```

#### Concurrency tests (applicable — cancellation)

Cancellation: issue request, advance fake timers past timeout (or abort client signal mid-stream); assert the upstream fetch receives an aborted signal and the handler returns 504 without leaking a pending promise.

Race-aware test: happens-before observation via an explicit barrier (Promise.all / deferred), asserting the post-barrier invariant; single-threaded execution cannot reproduce the interleaving.

#### Acceptance Criteria
- [ ] Stalled upstream → 504; signal always provided; TTS stream cancels on client abort — verified by `pnpm test` (exit 0) plus `pnpm typecheck` and `pnpm lint` (0 warnings).
- [ ] Pass: lint/size/coverage — verified by `pnpm test` (exit 0) plus `pnpm typecheck` and `pnpm lint` (0 warnings).

#### DoD
- [ ] voice suite green; typecheck/lint clean.

### T5.2 — Recorder: release stream + surface error on recording error (#213, test #237)

#### Objective
A MediaRecorder error during recording always releases the stream and surfaces via `onError`.

#### Why this step
1. **What:** on the `error` event always call `releaseStream()` and surface via `onError` callback/state, not only when a `stop()` is pending.
2. **Why now:** HIGH — dropped error + leaked stream (#213). Baseline row `recorder.ts`.

#### Evidence
`packages/plugin-voice/src/recorder.ts:135`. Finding #213.

#### Files to edit
```
packages/plugin-voice/src/recorder.ts — releaseStream + onError on error event
packages/plugin-voice/tests/recorder.test.ts — RED: error during recording releases tracks + surfaces error
```

#### Deep file dependency analysis
- `onError` contract (invariant) now fires for in-recording errors; stream lifecycle corrected.

#### Deep Dives
- Edge: error with no pending stop (the gap today); error after stop (existing path).

#### Tasks
1. RED: `start()`, emit error while recording → typed error surfaced AND `getTracks().stop()` called.
2. Implement always-release + onError.
3. Run suite.

#### TDD
```
RED: test_recording_error_releases_stream_and_surfaces()
GREEN: always releaseStream + onError on error
REFACTOR: None expected
VERIFY: pnpm --filter @theokit/plugin-voice test
```

#### Concurrency tests

(none — single-threaded)

#### Acceptance Criteria
- [ ] Recording error releases stream + surfaces; no leak — verified by `pnpm test` (exit 0) plus `pnpm typecheck` and `pnpm lint` (0 warnings).

#### DoD
- [ ] voice suite green; typecheck/lint clean.

### T5.3 — Don't reflect upstream error bodies (#214)

#### Objective
Upstream provider error bodies are logged server-side, not returned to the client.

#### Why this step
1. **What:** log the upstream body server-side; return a generic client message + correlation id (STT and TTS).
2. **Why now:** raw upstream reflection can leak provider internals (#214). Per ADR D8.

#### Evidence
`stt-server.ts:126` / `tts-server.ts:117`. Finding #214.

#### Files to edit
```
packages/plugin-voice/src/stt-server.ts — generic client error + correlation id
packages/plugin-voice/src/tts-server.ts — same
packages/plugin-voice/tests/stt-server.test.ts — RED: upstream error body not in client response
```

#### Deep file dependency analysis
- Error-response shape tightened; handler signatures stable.

#### Deep Dives
- Edge: correlation id present in both log and client message for support.

#### Tasks
1. RED: upstream 4xx/5xx with a body → client gets generic message+id, not raw body.
2. Implement.
3. Run suite.

#### TDD
```
RED: test_upstream_error_body_not_reflected()
GREEN: generic message + correlation id + server log
REFACTOR: None expected
VERIFY: pnpm --filter @theokit/plugin-voice test
```

#### Concurrency tests

(none — single-threaded)

#### Acceptance Criteria
- [ ] Client never sees raw upstream body; correlation id present — verified by `pnpm test` (exit 0) plus `pnpm typecheck` and `pnpm lint` (0 warnings).

#### DoD
- [ ] voice suite green; typecheck/lint clean.

### T5.4 — Unify TTS voice enum across schema & server (#215)

#### Objective
One source of truth for valid voices.

#### Why this step
1. **What:** define `z.enum([...VALID_VOICES])` once, imported in both `options.ts` and `tts-server.ts`, so an invalid default is rejected at construction.
2. **Why now:** schema (any string) diverges from server enum (#215); DRY across the boundary.

#### Evidence
`packages/plugin-voice/src/tts-server.ts:22`. Finding #215.

#### Files to edit
```
packages/plugin-voice/src/tts-server.ts — import shared enum
packages/plugin-voice/src/options.ts — define/own VALID_VOICES enum
packages/plugin-voice/tests/*.test.ts — RED: invalid default voice rejected
```

#### Deep file dependency analysis
- Shared enum; `talk-options.tsx` already mirrors `VALID_VOICES` (keep in sync per its own docstring).

#### Deep Dives
- Edge: invalid configured default → construction error.

#### Tasks
1. RED: invalid default voice → rejected at construction.
2. Extract shared enum; wire both ends.
3. Run suite.

#### TDD
```
RED: test_invalid_default_voice_rejected_at_construction()
GREEN: single z.enum imported both ends
REFACTOR: None expected
VERIFY: pnpm --filter @theokit/plugin-voice test
```

#### Concurrency tests

(none — single-threaded)

#### Acceptance Criteria
- [ ] One voice enum; invalid default rejected — verified by `pnpm test` (exit 0) plus `pnpm typecheck` and `pnpm lint` (0 warnings).

#### DoD
- [ ] voice suite green; typecheck/lint clean.

### T5.5 — use-tts: cancel stale playback on newer speak()/stop() (#216, test #238)

#### Objective
A stale `audio.play()` resolving late does not override a newer call.

#### Why this step
1. **What:** capture a per-call controller; after every `await`, bail (revoking its own URL) when `abortRef.current !== controller`, not just on `signal.aborted`.
2. **Why now:** HIGH-impact UI race — stale playback overrides newer state (#216). Baseline row `use-tts.ts`.

#### Evidence
`packages/plugin-voice/src/ui/use-tts.ts:184`. Finding #216.

#### Files to edit
```
packages/plugin-voice/src/ui/use-tts.ts — per-call controller identity check after awaits
packages/plugin-voice/tests/use-tts.test.tsx — RED: speak(A) then speak(B), resolve A last → state reflects B
```

#### Deep file dependency analysis
- Hook-internal; return shape stable.

#### Deep Dives
- Edge: speak then stop; older play resolves last → idle, not stale A.

#### Tasks
1. RED: controllable play() resolution; resolve older last; assert phase = B/idle.
2. Implement controller-identity bail.
3. Run suite.

#### TDD
```
RED: test_stale_play_does_not_override_newer_speak()
GREEN: per-call controller identity check
REFACTOR: None expected
VERIFY: pnpm --filter @theokit/plugin-voice test
```

#### Concurrency tests (applicable — async ordering)

Async ordering: dispatch speak(A) then speak(B) with controllable play() promises; resolve A AFTER B; assert final phase reflects B (or idle on stop), proving the stale-resolution is bailed. Barrier via deferred promises.

Race-aware test: happens-before observation via an explicit barrier (Promise.all / deferred), asserting the post-barrier invariant; single-threaded execution cannot reproduce the interleaving.

#### Acceptance Criteria
- [ ] Stale playback bailed; newest call wins — verified by `pnpm test` (exit 0) plus `pnpm typecheck` and `pnpm lint` (0 warnings).

#### DoD
- [ ] voice suite green; typecheck/lint clean.

### T5.6 — voice-recorder-bar: guard STT JSON parse (#217)

#### Objective
A malformed STT success response surfaces a specific error.

#### Why this step
1. **What:** wrap `res.json()` in try/catch and surface a specific invalid-STT-response error.
2. **Why now:** unguarded `res.json()` throws opaquely (#217). Baseline row `voice-recorder-bar.tsx`.

#### Evidence
`packages/plugin-voice/src/ui/voice-recorder-bar.tsx:167`. Finding #217.

#### Files to edit
```
packages/plugin-voice/src/ui/voice-recorder-bar.tsx — try/catch around res.json + typed error
packages/plugin-voice/tests/*.test.tsx — RED: malformed response → specific error
```

#### Deep file dependency analysis
- UI-internal; no public-surface change.

#### Deep Dives
- Edge: non-JSON body / wrong content-type → specific error, not crash.

#### Tasks
1. RED: malformed STT response → invalid-response error surfaced.
2. Implement guard.
3. Run suite.

#### TDD
```
RED: test_malformed_stt_response_surfaces_specific_error()
GREEN: try/catch + typed error
REFACTOR: None expected
VERIFY: pnpm --filter @theokit/plugin-voice test
```

#### Concurrency tests

(none — single-threaded)

#### Acceptance Criteria
- [ ] Malformed STT response → specific error, no crash — verified by `pnpm test` (exit 0) plus `pnpm typecheck` and `pnpm lint` (0 warnings).

#### DoD
- [ ] voice suite green; typecheck/lint clean.

### T5.7 — Fix stale docstring in voice index (#175)

#### Objective
`index.ts` docstring matches the current handler signature.

#### Why this step
1. **What:** update the `index.ts` docstring describing the handler signature.
2. **Why now:** doc drift (#175, low) — cheap, do it with the voice phase.

#### Evidence
`packages/plugin-voice/src/index.ts:7`. Finding #175.

#### Files to edit
```
packages/plugin-voice/src/index.ts — correct docstring
```

#### Deep file dependency analysis
- Doc-only; exports unchanged.

#### Deep Dives
- (none)

#### Tasks
1. Update docstring to match code.

#### TDD
```
RED: test_none_doc_only_covered_by_typecheck_that_exports_() — (none — doc-only; covered by typecheck that exports compile)
GREEN: edit docstring
REFACTOR: None expected
VERIFY: pnpm --filter @theokit/plugin-voice typecheck
```

#### Concurrency tests

(none — single-threaded)

#### Acceptance Criteria
- [ ] Docstring matches code — verified by `pnpm test` (exit 0) plus `pnpm typecheck` and `pnpm lint` (0 warnings).

#### DoD
- [ ] typecheck clean.

---

## Phase 6: Copilot — AI safety & runtime contracts

**Objective:** Prompt injection isolated; budget TOCTOU/queue fixed; runtime contracts tightened; docs reconciled.

### T6.1 — Isolate untrusted room text into a user-role message (#218, test #232)

#### Objective
Untrusted text never enters the system prompt.

#### Why this step
1. **What:** pass user content as a distinct user-role message; apply input framing/escaping; never concatenate untrusted text into the system role.
2. **Why now:** HIGH prompt injection (#218, OWASP LLM01). Per ADR D7. Baseline row `runtime.ts`.

#### Evidence
`packages/plugin-copilot/src/internal/runtime.ts:311`. Finding #218.

#### Files to edit
```
packages/plugin-copilot/src/internal/runtime.ts — user-role message isolation in framePrompt
packages/plugin-copilot/tests/runtime.test.ts — RED: malicious payload stays role-isolated
```

#### Deep file dependency analysis
- `framePrompt` assembly changes; `CopilotRuntime` public API stable (invariant).

#### Deep Dives
- Edge: empty text; very long text (truncation policy documented).

#### Tasks
1. RED: broadcast a malicious instruction; assert captured agent opts show user text in a fenced/role-isolated boundary, not raw concatenation.
2. Implement role isolation.
3. Run suite.

#### TDD
```
RED: test_untrusted_text_is_role_isolated()
GREEN: user-role message + framing
REFACTOR: None expected
VERIFY: pnpm --filter @theokit/plugin-copilot test
```

#### Concurrency tests

(none — single-threaded)

#### Acceptance Criteria
- [ ] Untrusted text role-isolated; system prompt uncontaminated — verified by `pnpm test` (exit 0) plus `pnpm typecheck` and `pnpm lint` (0 warnings).

#### DoD
- [ ] copilot suite green; typecheck/lint clean.

### T6.2 — One per-copilot queue + atomic budget; idle-trigger guarded (#219, #223, #221, test #233)

#### Objective
Broadcast and idle paths share one queue; preflight+charge is atomic; idle runAgent cannot fire after deactivate.

#### Why this step
1. **What:** route idle-trigger `runAgent` through the same per-copilot queue; reserve estimated cost at preflight and reconcile on completion (single critical section); track idle promises and await/guard them in `deactivate`.
2. **Why now:** HIGH budget TOCTOU/double-spend (#219), non-atomic window-reset+charge (#223), idle-after-deactivate (#221). Per ADR D7. Baseline rows `runtime.ts`, `budget-bridge.ts`.

#### Evidence
`runtime.ts:145` (#219), `:152` (#221), `budget-bridge.ts:50` (#223).

#### Files to edit
```
packages/plugin-copilot/src/internal/runtime.ts — idle through queue; track/guard idle promises
packages/plugin-copilot/src/internal/budget-bridge.ts — atomic preflight+charge (reservation token)
packages/plugin-copilot/tests/runtime.test.ts — RED: idle+broadcast concurrent → preflight once, no double-charge
```

#### Deep file dependency analysis
- `BudgetBridge` interface stable (invariant); internal atomicity changes. Runtime serialization extended to idle path.

#### Deep Dives
- Invariant: budget preflight runs once per invocation; no queue bypass; deactivate awaits in-flight idle.
- Edge: idle fires exactly as deactivate runs → guarded.
- Edge (EC-2): a reservation made at preflight MUST be released/reconciled in a `finally` so a `runAgent` that throws or hangs does not leak reserved budget forever (reconcile actual on success, release reservation on failure/cancellation).

#### Tasks
1. RED: activate copilot with `presence:idle` trigger + tight `perRequest` budget; fire idle check concurrently with a broadcast; assert preflight runs once, no double-charge, no bypass.
2. Implement queue routing + reservation token + deactivate guard.
3. Run suite.

#### TDD
```
RED: test_idle_and_broadcast_do_not_double_spend()
RED: test_idle_runagent_blocked_after_deactivate()
RED: test_reservation_released_when_runagent_throws()  -- EC-2: a failed invocation does not leak reserved budget (finally releases)
GREEN: single queue + atomic reserve/reconcile + deactivate await/guard; release reservation in finally
REFACTOR: None expected
VERIFY: pnpm --filter @theokit/plugin-copilot test
```

#### Concurrency tests (applicable)

Atomic-counter invariant: N concurrent invocations (idle + broadcast) against a tight budget; assert total charged == sum of reserved (no lost update) and preflight admitted only the allowed count. Barrier via Promise.all; spy on charge/preflight call counts. Single-thread TDD cannot catch this TOCTOU.

#### Acceptance Criteria
- [ ] No double-spend; one queue; idle guarded post-deactivate — verified by `pnpm test` (exit 0) plus `pnpm typecheck` and `pnpm lint` (0 warnings).
- [ ] Pass: lint/size/coverage — verified by `pnpm test` (exit 0) plus `pnpm typecheck` and `pnpm lint` (0 warnings).

#### DoD
- [ ] copilot suite green; typecheck/lint clean.

### T6.3 — handleFrame: log errors instead of empty catch (#222)

#### Objective
Frame-handling errors are observable.

#### Why this step
1. **What:** log the error with `copilotId/roomId` context in the catch; keep the chain alive but observable.
2. **Why now:** empty `.catch` swallows failures (#222, Rule 8). Baseline row `runtime.ts`.

#### Evidence
`runtime.ts:185`. Finding #222.

#### Files to edit
```
packages/plugin-copilot/src/internal/runtime.ts — contextual log in handleFrame catch
packages/plugin-copilot/tests/runtime.test.ts — RED: handler error is logged with context
```

#### Deep file dependency analysis
- Internal; chain behavior preserved, now observable.

#### Deep Dives
- Edge: error still does not crash the chain; just logged.

#### Tasks
1. RED: induce a frame error; assert it's logged with copilotId/roomId.
2. Implement logging.
3. Run suite.

#### TDD
```
RED: test_handleframe_error_logged_with_context()
GREEN: contextual log in catch
REFACTOR: None expected
VERIFY: pnpm --filter @theokit/plugin-copilot test
```

#### Concurrency tests

(none — single-threaded)

#### Acceptance Criteria
- [ ] Frame errors logged with context; chain alive — verified by `pnpm test` (exit 0) plus `pnpm typecheck` and `pnpm lint` (0 warnings).

#### DoD
- [ ] copilot suite green; typecheck/lint clean.

### T6.4 — Round-robin dispatcher: key cursor by roomId (#220)

#### Objective
The dispatcher cursor is keyed by room, not connection.

#### Why this step
1. **What:** key the cursor by `reg.descriptor.room.id` (available at call site), not `frame.connectionId`.
2. **Why now:** wrong key breaks round-robin fairness (#220). Baseline row `runtime.ts`.

#### Evidence
`runtime.ts:298`. Finding #220.

#### Files to edit
```
packages/plugin-copilot/src/internal/runtime.ts — cursor keyed by room id
packages/plugin-copilot/tests/runtime.test.ts — RED: round-robin advances per room
```

#### Deep file dependency analysis
- Internal dispatch; behavior corrected.

#### Deep Dives
- Edge: multiple connections in one room share the room cursor.

#### Tasks
1. RED: assert round-robin advances by room across connections.
2. Implement key change.
3. Run suite.

#### TDD
```
RED: test_round_robin_keyed_by_room()
GREEN: cursor by room id
REFACTOR: None expected
VERIFY: pnpm --filter @theokit/plugin-copilot test
```

#### Concurrency tests

(none — covered by T6.2 for shared-state ordering)

Race-aware test: happens-before observation via an explicit barrier (Promise.all / deferred), asserting the post-barrier invariant; single-threaded execution cannot reproduce the interleaving.

#### Acceptance Criteria
- [ ] Cursor keyed by room; fair rotation — verified by `pnpm test` (exit 0) plus `pnpm typecheck` and `pnpm lint` (0 warnings).

#### DoD
- [ ] copilot suite green; typecheck/lint clean.

### T6.5 — streamObject: real schema, not passthrough (#224)

#### Objective
Non-conforming completions are rejected, not coerced.

#### Why this step
1. **What:** pass `z.object({text:z.string()})` (real schema) to `streamObject` instead of a passthrough that disables validation.
2. **Why now:** passthrough disables output validation (#224). Baseline row `runtime.ts`.

#### Evidence
`runtime.ts:238`. Finding #224.

#### Files to edit
```
packages/plugin-copilot/src/internal/runtime.ts — real schema for streamObject
packages/plugin-copilot/tests/runtime.test.ts — RED: non-conforming completion rejected
```

#### Deep file dependency analysis
- Internal; output contract tightened.

#### Deep Dives
- Edge: conforming output passes; malformed rejected.

#### Tasks
1. RED: malformed completion → rejected.
2. Implement schema.
3. Run suite.

#### TDD
```
RED: test_non_conforming_completion_rejected()
GREEN: real z.object schema
REFACTOR: None expected
VERIFY: pnpm --filter @theokit/plugin-copilot test
```

#### Concurrency tests

(none — single-threaded)

#### Acceptance Criteria
- [ ] Malformed output rejected; valid passes — verified by `pnpm test` (exit 0) plus `pnpm typecheck` and `pnpm lint` (0 warnings).

#### DoD
- [ ] copilot suite green; typecheck/lint clean.

### T6.6 — Budget charges actual usage, not a fixed estimate (#174)

#### Objective
Budget accounting reflects actual cost after invocation.

#### Why this step
1. **What:** charge actual cost on completion (reconcile the reservation from T6.2) instead of a fixed `estimatedCostPerInvocationUsd`.
2. **Why now:** README promises actual-cost accounting; current meter drifts (#174). Pairs with the T6.2 reservation model.

#### Evidence
`runtime.ts:261`. Finding #174.

#### Files to edit
```
packages/plugin-copilot/src/internal/runtime.ts — reconcile actual cost on completion
packages/plugin-copilot/tests/runtime.test.ts — RED: getUsage reflects actual, not estimate
```

#### Deep file dependency analysis
- Builds on T6.2 reservation token; `getUsage()` now accurate.

#### Deep Dives
- Edge: provider doesn't report cost → fall back to estimate, documented.

#### Tasks
1. RED: completion with known actual cost ≠ estimate → `getUsage()` reflects actual.
2. Implement reconciliation.
3. Run suite.

#### TDD
```
RED: test_getusage_reflects_actual_cost()
GREEN: reconcile actual on completion
REFACTOR: None expected
VERIFY: pnpm --filter @theokit/plugin-copilot test
```

#### Concurrency tests

(covered by T6.2 atomic reserve/reconcile)

Race-aware test: happens-before observation via an explicit barrier (Promise.all / deferred), asserting the post-barrier invariant; single-threaded execution cannot reproduce the interleaving.

#### Acceptance Criteria
- [ ] Usage reflects actual cost; fallback documented — verified by `pnpm test` (exit 0) plus `pnpm typecheck` and `pnpm lint` (0 warnings).

#### DoD
- [ ] copilot suite green; typecheck/lint clean.

### T6.7 — Reconcile copilot README with CopilotProvider props & hook signatures (#172, #173)

#### Objective
Documented integration path compiles and works as written.

#### Why this step
1. **What:** reconcile README Quick start (`localConnectionId`/`runtime`, positional `useCopilotReadable`, `useCopilotTool({name,schema})`) with the real `CopilotProviderProps` (`userConnectionId`) and object-arg hook signatures — fix whichever side is wrong (prefer aligning README to the implemented, tested API; add `runtime` prop only if intended).
2. **Why now:** HIGH completeness — the headline integration path is mis-documented (#172) and hook signatures mismatch (#173). Baseline rows `copilot-provider.tsx`, `hooks.ts`.

#### Evidence
`copilot-provider.tsx:26` (#172), `hooks.ts:59` (#173).

#### Files to edit
```
packages/plugin-copilot/README.md — align Quick start with real API
packages/plugin-copilot/src/react/copilot-provider.tsx — (only if adding intended props) 
packages/plugin-copilot/src/react/hooks.ts — (only if signature is the bug)
packages/plugin-copilot/tests/*.test.tsx — RED: a test mirrors the README Quick start and compiles/runs
```

#### Deep file dependency analysis
- Decide source of truth: the tested code API wins unless a prop was genuinely intended; document the decision inline.

#### Deep Dives
- Edge: if `runtime` was an intended prop, add it with a test; else remove from README.

#### Tasks
1. RED: a test using the documented Quick start props/signatures compiles and behaves.
2. Align README (and code only if a real bug).
3. Run suite + typecheck.

#### TDD
```
RED: test_documented_quickstart_compiles_and_works()
GREEN: reconcile README/code
REFACTOR: None expected
VERIFY: pnpm --filter @theokit/plugin-copilot test && pnpm --filter @theokit/plugin-copilot typecheck
```

#### Concurrency tests

(none — single-threaded)

#### Acceptance Criteria
- [ ] README Quick start compiles & runs against the real API — verified by `pnpm test` (exit 0) plus `pnpm typecheck` and `pnpm lint` (0 warnings).

#### DoD
- [ ] copilot suite green; typecheck/lint clean; README updated.

---

## Phase 7: db-drizzle CLI + devtools + misc

**Objective:** CLI verbs honor documented behavior; devtools iframe is safe.

### T7.1 — Implement the `reset --force` destructive guard (#168)

#### Objective
`reset` requires `--force` as documented.

#### Why this step
1. **What:** `baseArgs` appends/checks `--force` for `reset` (or guards on its presence before running).
2. **Why now:** HIGH completeness — documented destructive-op guard does not exist (#168). Baseline row `cli/db.ts`.

#### Evidence
`packages/plugin-db-drizzle/src/cli/db.ts:74`. Finding #168.

#### Files to edit
```
packages/plugin-db-drizzle/src/cli/db.ts — reset --force guard
packages/plugin-db-drizzle/tests/*.test.ts — RED: reset without --force refused
```

#### Deep file dependency analysis
- Arg builder; verb set stable (invariant).

#### Deep Dives
- Edge: `reset --force` proceeds; `reset` alone refused.

#### Tasks
1. RED: `reset` without `--force` → refused; with → proceeds.
2. Implement guard.
3. Run suite.

#### TDD
```
RED: test_reset_requires_force()
GREEN: --force guard
REFACTOR: None expected
VERIFY: pnpm --filter @theokit/plugin-db-drizzle test
```

#### Concurrency tests

(none — single-threaded)

#### Acceptance Criteria
- [ ] reset gated on --force — verified by `pnpm test` (exit 0) plus `pnpm typecheck` and `pnpm lint` (0 warnings).

#### DoD
- [ ] db-drizzle suite green; typecheck/lint clean.

### T7.2 — Forward `driver`/`url` to drizzle-kit (#169)

#### Objective
Documented connection options reach the CLI invocation.

#### Why this step
1. **What:** `baseArgs` forwards `driver`/`url`/`dialect` for verbs that need a connection (migrate/push/studio/check).
2. **Why now:** MEDIUM — documented options accepted but dropped (#169). Baseline row `cli/db.ts`.

#### Evidence
`cli/db.ts:75`. Finding #169.

#### Files to edit
```
packages/plugin-db-drizzle/src/cli/db.ts — forward driver/url/dialect
packages/plugin-db-drizzle/tests/*.test.ts — RED: args include connection opts
```

#### Deep file dependency analysis
- `resolveOptions` already surfaces these on `plugin.options`; thread them into args.

#### Deep Dives
- Edge: verbs that don't need a connection (generate) unaffected.

#### Tasks
1. RED: assert migrate/push args include driver/url.
2. Implement forwarding.
3. Run suite.

#### TDD
```
RED: test_connection_opts_forwarded_to_drizzle_kit()
GREEN: forward driver/url/dialect
REFACTOR: None expected
VERIFY: pnpm --filter @theokit/plugin-db-drizzle test
```

#### Concurrency tests

(none — single-threaded)

#### Acceptance Criteria
- [ ] Connection opts present in args for relevant verbs — verified by `pnpm test` (exit 0) plus `pnpm typecheck` and `pnpm lint` (0 warnings).

#### DoD
- [ ] db-drizzle suite green; typecheck/lint clean.

### T7.3 — `seed` runs the user seed script (#170)

#### Objective
`seed` runs `package.json#theokit.db.seed`, not a nonexistent drizzle-kit subcommand.

#### Why this step
1. **What:** route `seed` to the user-provided seed script instead of building `["seed",...]`.
2. **Why now:** MEDIUM — `drizzle-kit seed` does not exist (#170). Baseline row `cli/db.ts`.

#### Evidence
`cli/db.ts:78`. Finding #170.

#### Files to edit
```
packages/plugin-db-drizzle/src/cli/db.ts — seed runs user script
packages/plugin-db-drizzle/tests/*.test.ts — RED: seed invokes the configured script
```

#### Deep file dependency analysis
- Special-case `seed` away from the drizzle-kit arg path.

#### Deep Dives
- Edge: missing seed script → clear error.

#### Tasks
1. RED: `seed` invokes the configured script; missing → error.
2. Implement.
3. Run suite.

#### TDD
```
RED: test_seed_runs_user_script()
GREEN: route seed to user script
REFACTOR: None expected
VERIFY: pnpm --filter @theokit/plugin-db-drizzle test
```

#### Concurrency tests

(none — single-threaded)

#### Acceptance Criteria
- [ ] seed runs user script; missing handled — verified by `pnpm test` (exit 0) plus `pnpm typecheck` and `pnpm lint` (0 warnings).

#### DoD
- [ ] db-drizzle suite green; typecheck/lint clean.

### T7.4 — Fix the no-op CLI conflict guard (#171)

#### Objective
The EC-4 conflict guard actually differentiates the two branches.

#### Why this step
1. **What:** make the `hasCliCommand` branches behave differently (real conflict handling) instead of both calling `registerCliCommand` identically.
2. **Why now:** LOW completeness — guard is a no-op (#171). Baseline row `index.ts`.

#### Evidence
`packages/plugin-db-drizzle/src/index.ts:61`. Finding #171.

#### Files to edit
```
packages/plugin-db-drizzle/src/index.ts — real conflict behavior
packages/plugin-db-drizzle/tests/*.test.ts — RED: conflict path differs
```

#### Deep file dependency analysis
- CLI registration path; behavior corrected.

#### Deep Dives
- Edge: existing command present → conflict handled (error/skip per intent).

#### Tasks
1. RED: pre-existing command → conflict branch differs.
2. Implement.
3. Run suite.

#### TDD
```
RED: test_cli_conflict_guard_is_effective()
GREEN: differentiate branches
REFACTOR: None expected
VERIFY: pnpm --filter @theokit/plugin-db-drizzle test
```

#### Concurrency tests

(none — single-threaded)

#### Acceptance Criteria
- [ ] Conflict guard effective — verified by `pnpm test` (exit 0) plus `pnpm typecheck` and `pnpm lint` (0 warnings).

#### DoD
- [ ] db-drizzle suite green; typecheck/lint clean.

### T7.5 — Devtools iframe sandbox + studioUrl from options (#206, #207)

#### Objective
The studio iframe is not a sandbox-escape; studioUrl honors resolved options.

#### Why this step
1. **What:** drop `allow-same-origin` (or don't pair it with `allow-scripts`); plumb studio host/port through `ResolvedDrizzleDbOptions` to build `studioUrl` (default 4983 only when unset).
2. **Why now:** MEDIUM sandbox escape (#206) + LOW hardcoded url (#207). Baseline row `devtools.ts`.

#### Evidence
`devtools.ts:45` (#206), `:37` (#207).

#### Files to edit
```
packages/plugin-db-drizzle/src/devtools.ts — sandbox attrs + studioUrl from options
packages/plugin-db-drizzle/tests/*.test.ts — RED: sandbox lacks same-origin+scripts pair; url from options
```

#### Deep file dependency analysis
- Devtools-only; trust boundary documented.

#### Deep Dives
- Edge: custom host/port reflected in url.

#### Tasks
1. RED: iframe sandbox does not combine allow-same-origin+allow-scripts; studioUrl uses configured host/port.
2. Implement.
3. Run suite.

#### TDD
```
RED: test_iframe_sandbox_is_safe()
RED: test_studio_url_from_resolved_options()
GREEN: fix sandbox + plumb url
REFACTOR: None expected
VERIFY: pnpm --filter @theokit/plugin-db-drizzle test
```

#### Concurrency tests

(none — single-threaded)

#### Acceptance Criteria
- [ ] Safe sandbox; url from options — verified by `pnpm test` (exit 0) plus `pnpm typecheck` and `pnpm lint` (0 warnings).

#### DoD
- [ ] db-drizzle suite green; typecheck/lint clean.

---

## Phase 8: Test-quality leftovers (email, forms)

**Objective:** Tests exercise real behavior, not duplicated logic or absent-dependency assertions.

### T8.1 — Email: real happy-path render test (#228)

#### Objective
`renderReactEmail` happy path is covered, decoupled from the dependency-absent global.

#### Why this step
1. **What:** add a happy-path test injecting a stub renderer (or add `@react-email/render` devDependency) asserting the expected HTML; decouple the missing-dep test by mocking the dynamic import to reject.
2. **Why now:** MEDIUM — happy path untested; assertion coupled to a dependency being ABSENT (#228). Baseline row `render-react-email.test.ts`.

#### Evidence
`packages/plugin-email/tests/render-react-email.test.ts:13`. Finding #228.

#### Files to edit
```
packages/plugin-email/tests/render-react-email.test.ts — happy-path + decoupled missing-dep test
```

#### Deep file dependency analysis
- Test-only; mocks the dynamic import.

#### Deep Dives
- Edge: dep present → HTML; dep missing (mocked reject) → documented fallback.

#### Tasks
1. RED: happy path asserts HTML; missing-dep test mocks import reject.
2. Implement tests (+ devDependency if chosen).
3. Run suite.

#### TDD
```
RED: test_render_react_email_happy_path()
RED: test_render_react_email_missing_dep_mocked()
GREEN: tests pass against real renderReactEmail
REFACTOR: None expected
VERIFY: pnpm --filter @theokit/plugin-email test
```

#### Concurrency tests

(none — single-threaded)

#### Acceptance Criteria
- [ ] Happy path covered; missing-dep test environment-independent — verified by `pnpm test` (exit 0) plus `pnpm typecheck` and `pnpm lint` (0 warnings).

#### DoD
- [ ] email suite green; typecheck/lint clean.

### T8.2 — Forms: test the real component, not a copy (#227)

#### Objective
`TheoForm` error routing is tested against the real component.

#### Why this step
1. **What:** mount `<TheoForm>` with a mocked `useAction` and assert the real `handleValid` catch routes field errors to RHF `setError` and re-throws non-field errors; OR extract `handleValid` into an exported pure function imported by the test (single source).
2. **Why now:** MEDIUM — the test duplicates catch-block logic, not the component (#227). Baseline row `TheoForm.test.tsx`.

#### Evidence
`packages/plugin-forms/tests/unit/TheoForm.test.tsx:20`. Finding #227.

#### Files to edit
```
packages/plugin-forms/tests/unit/TheoForm.test.tsx — mount real component (or import extracted handleValid)
packages/plugin-forms/src/... — (only if extracting handleValid to a pure exported fn)
```

#### Deep file dependency analysis
- Prefer mounting; if infeasible, extract pure `handleValid` so prod and test share one source.

#### Deep Dives
- Edge: field error → setError; non-field error → re-throw.

#### Tasks
1. RED: real component (or extracted fn) routes field errors / re-throws.
2. Implement (extract if needed).
3. Run suite.

#### TDD
```
RED: test_theoform_routes_field_errors_and_rethrows()
GREEN: test the real component/extracted fn
REFACTOR: None expected
VERIFY: pnpm --filter @theokit/plugin-forms test
```

#### Concurrency tests

(none — single-threaded)

#### Acceptance Criteria
- [ ] Real component/extracted fn tested; no duplicated logic — verified by `pnpm test` (exit 0) plus `pnpm typecheck` and `pnpm lint` (0 warnings).

#### DoD
- [ ] forms suite green; typecheck/lint clean.

---

## Phase 9: Cyclomatic-complexity reduction (runs per-file AFTER behavioral fixes)

**Objective:** Reduce the 8 functions flagged CC 16–24 toward ≤ 10, behavior-preserving under existing + characterization tests (per ADR D9).

> Each task: add characterization tests first (if coverage thin), then extract helpers / early returns / dispatch tables; existing tests stay green; no behavior change. Files: github `index.ts:59` (#183, CC23), canvas `store.ts:49` (#182, CC24), canvas `artifact-actions.ts:104` (#187, CC19), canvas `sanitize.ts:43` `classifyRemovals` (#186, CC19 — after T1.4), copilot `define-copilot.ts:74` (#184, CC23), realtime `react/index.ts:119` (#185, CC19), voice `stt-server.ts:67` (#188, CC16 — after T5.1), voice `tts-server.ts:43` (#189, CC16 — after T5.1).

### T9.1 — Reduce CC of the 8 flagged functions (#182,#183,#184,#185,#186,#187,#188,#189)

#### Objective
Each flagged function reaches CC ≤ 10 (or as close as a behavior-preserving extraction allows, documented if not).

#### Why this step (action + reasoning)
1. **What:** mechanically extract named helpers / early returns / dispatch tables in each of the 8 functions.
2. **Why now:** medium maintainability findings; run LAST per file so refactors don't churn against the behavioral fixes in Phases 1/5 (e.g., `sanitize.ts` after T1.4, `stt/tts` after T5.1). Per ADR D9 + `architecture.md`.

#### Evidence
Measured CC via `lizard` (audit run id 2, `code-review-output/audit/lizard.csv`): `store.ts:49` CC=24, `index.ts(github):59` CC=23, `define-copilot.ts:74` CC=23, `react/index.ts:119` CC=19, `sanitize.ts:43` CC=19, `artifact-actions.ts:104` CC=19, `stt-server.ts:67` CC=16, `tts-server.ts:43` CC=16. Findings #182–#189.

#### Files to edit
```
packages/auth-github/src/index.ts — extract helpers in github()
packages/plugin-canvas/src/store.ts — extract helpers in createInMemoryArtifactStore()
packages/plugin-canvas/src/ui/artifact-actions.ts — extract helpers in serializeArtifactForCopy()
packages/plugin-canvas/src/ui/renderers/sanitize.ts — extract helpers in classifyRemovals() (after T1.4)
packages/plugin-copilot/src/define-copilot.ts — extract helpers in defineCopilot()
packages/plugin-realtime/src/react/index.ts — extract helper from the CC=19 effect
packages/plugin-voice/src/stt-server.ts — extract helpers in handleSttRequest() (after T5.1)
packages/plugin-voice/src/tts-server.ts — extract helpers in handleTtsRequest() (after T5.1)
(test files as needed for characterization)
```

#### Deep file dependency analysis
- All public signatures stable (invariants from Baseline rows); extractions are internal. Each file stays ≤ 500 LoC.

#### Deep Dives
- Approach per function: identify the branch clusters, hoist into pure named helpers, replace nested conditionals with early returns or lookup tables.
- Edge: behavior MUST be identical — rely on existing tests + add characterization tests where coverage is thin BEFORE refactoring.

#### Tasks
1. For each file: ensure characterization coverage; extract; confirm tests green; measure CC.
2. Re-run `lizard` to confirm CC reduction.

#### TDD
```
RED:  test_store_behaves_as_before() — (characterization where missing) e.g. , serialize_copy_snapshot()
GREEN: extract helpers; all existing + characterization tests stay green
REFACTOR: this task IS the refactor — verify no behavior change
VERIFY: pnpm -r test  &&  lizard packages -l typescript (CC of the 8 functions ≤ 10 or documented)
```

#### Concurrency tests

(none — pure extraction; no new shared state. The stt/tts files' concurrency is covered by T5.1.)

Race-aware test: happens-before observation via an explicit barrier (Promise.all / deferred), asserting the post-barrier invariant; single-threaded execution cannot reproduce the interleaving.

#### Acceptance Criteria
- [ ] Each of the 8 functions CC ≤ 10 (or documented why a higher floor is unavoidable) — verified by `pnpm test` (exit 0) plus `pnpm typecheck` and `pnpm lint` (0 warnings).
- [ ] All existing tests green (behavior preserved) — verified by `pnpm test` (exit 0) plus `pnpm typecheck` and `pnpm lint` (0 warnings).
- [ ] Pass: size — every changed file ≤ 500 lines — verified by `pnpm test` (exit 0) plus `pnpm typecheck` and `pnpm lint` (0 warnings).

#### DoD
- [ ] `pnpm -r test` green; typecheck/lint clean; `lizard` confirms reduction.

---

## Coverage Matrix

| # | Finding(s) | Task(s) | Resolution |
|---|---|---|---|
| 1 | #176 (CRITICAL) | T1.1 | enforceArtifactSecurity wired into REST create() + 4xx |
| 2 | #229 | T1.1 | RED test: malicious POST → 4xx |
| 3 | #178 | T1.2 | enforce covers mermaid/slide-deck/svg-data |
| 4 | #230 | T1.2 | RED tests for new kinds |
| 5 | #177 | T1.3 | sanitizeSvg before mermaid dangerouslySetInnerHTML |
| 6 | #231 | T1.3 | RED test: mermaid script SVG stripped |
| 7 | #180,#179 | T1.4 | verdict from DOMPurify removed[]; regex pass removed |
| 8 | #181 | T1.5 | pointless try/catch removed |
| 9 | #200,#199 | T2.1 | code-keyed zero-decimal + integer-exact money |
| 10 | #225 | T2.1 | RED currency contract tests |
| 11 | #167 | T2.2 | mark-after-success ordering |
| 12 | #226 | T2.2 | RED throwing-handler-retried test |
| 13 | #208,#201 | T2.3 | AggregateError dispatch + sanitized error boundary |
| 14 | #202 | T2.4 | loud memory-store guard in prod |
| 15 | #210 | T2.5 | apiVersion validated not cast |
| 16 | #190,#191 | T3.1 | magic-link CSRF state binding + token hashing |
| 17 | #204,#209,#205 | T3.2 | body cap + narrowed catch + URL join |
| 18 | #192 | T3.3 | google OIDC SSRF gating |
| 19 | #203 | T3.4 | github emails failure surfaced |
| 20 | #193,#196 | T4.1 | yjs in-flight memoization + return bundle |
| 21 | #234 | T4.1 | RED concurrent-join shares one doc |
| 22 | #194 | T4.2 | applyYjsUpdate destroyed-doc guard |
| 23 | #195,#198 | T4.3 | server-integration abort + bounded queue |
| 24 | #235 | T4.3 | NEW server-integration test |
| 25 | #197 | T4.4 | yjs unsupported-provider error |
| 26 | #211,#212 | T5.1 | STT/TTS timeout/abort + 504 |
| 27 | #236 | T5.1 | RED upstream-timeout tests |
| 28 | #213 | T5.2 | recorder release-stream + onError |
| 29 | #237 | T5.2 | RED recording-error leak test |
| 30 | #214 | T5.3 | upstream error body not reflected |
| 31 | #215 | T5.4 | unified TTS voice enum |
| 32 | #216 | T5.5 | use-tts stale-playback bail |
| 33 | #238 | T5.5 | RED stale-play race test |
| 34 | #217 | T5.6 | STT JSON parse guard |
| 35 | #175 | T5.7 | voice index docstring fixed |
| 36 | #218 | T6.1 | prompt-injection user-role isolation |
| 37 | #232 | T6.1 | RED prompt-injection containment test |
| 38 | #219,#223,#221 | T6.2 | one queue + atomic budget + idle guard |
| 39 | #233 | T6.2 | RED budget-TOCTOU test |
| 40 | #222 | T6.3 | handleFrame contextual logging |
| 41 | #220 | T6.4 | round-robin cursor by roomId |
| 42 | #224 | T6.5 | streamObject real schema |
| 43 | #174 | T6.6 | budget charges actual cost |
| 44 | #172,#173 | T6.7 | README props/hooks reconciled |
| 45 | #168 | T7.1 | reset --force guard |
| 46 | #169 | T7.2 | driver/url forwarded |
| 47 | #170 | T7.3 | seed runs user script |
| 48 | #171 | T7.4 | CLI conflict guard effective |
| 49 | #206,#207 | T7.5 | devtools sandbox + studioUrl |
| 50 | #228 | T8.1 | email real happy-path test |
| 51 | #227 | T8.2 | forms real-component test |
| 52 | #182,#183,#184,#185,#186,#187,#188,#189 | T9.1 | CC reduction of the 8 flagged functions |

**Coverage: 72/72 findings covered (100%).**

## Global Definition of Done

- [ ] All 9 phases + Integration Validation completed.
- [ ] All tests passing — `pnpm test` green.
- [ ] Zero type errors — `pnpm typecheck`.
- [ ] Zero lint warnings — `pnpm lint`.
- [ ] File-size budget respected (≤ 500 LoC per `rules/architecture.md`).
- [ ] CHANGELOG.md `[Unreleased]` updated (Unbreakable Rule 6) — entries for the security fix, money fix, webhook error-shape change, magic-link store migration.
- [ ] Backward compatibility preserved across public APIs EXCEPT the deliberate `WebhookResult.error` narrowing (D5) and magic-link store schema (D6), each with a changeset + CHANGELOG note.
- [ ] Plan-specific: a re-run of `loop-code-review` (or targeted re-audit) reports **0 findings ≥ low** for the 72 listed IDs.
- [ ] Runtime-metric proof — the new metrics (e.g., `payments_failed`/upstream-timeout/budget-charge counters) observed non-zero in integration tests, not just compiled.
- [ ] Plan archived to `knowledge-base/plans/completed/` only AFTER `/review` = READY_TO_MERGE and the PR is merged.

## Failure scenarios (when I/O external)

| Dependency | Failure mode | How the test reproduces it | Expected behavior |
|---|---|---|---|
| Stripe webhook (HTTP inbound) | handler throws (transient) | register a throwing handler; deliver same signed event twice (`webhook.test.ts`) | event NOT marked processed; non-2xx returned; redelivery re-runs handler (T2.2) |
| Stripe webhook (HTTP inbound) | multiple handler failures | two throwing handlers | both errors aggregated (AggregateError); sanitized `{code,message}` on boundary (T2.3) |
| STT upstream (HTTP `fetchImpl`) | never resolves / hang | injected `fetchImpl` that never resolves + fake timers | `AbortSignal.timeout` fires → 504 UPSTREAM_TIMEOUT; signal provided (T5.1) |
| TTS upstream (HTTP `fetchImpl`, streamed) | client aborts mid-stream | abort the client signal during streamed read | upstream stream cancelled; 504 mapping (T5.1) |
| STT/TTS upstream | provider returns 5xx with body | `fetchImpl` returns 500 + body | generic client message + correlation id; raw body logged server-side only (T5.3) |
| Realtime server bridge (stream) | client aborts mid-connection | abort ctx during `handleConnection` await | connection handle released once; no post-abort enqueue; queue bounded (T4.3) |
| OIDC discovery (HTTP, google) | discovery host ≠ base host | mock discovery returning cross-host endpoints | rejected (SSRF guard) (T3.3) |
| Magic-link resolveEmail (HTTP inbound) | oversized body | stream a body exceeding the cap | rejected (DoS cap) (T3.2) |

## Final Phase: Integration Validation (MANDATORY)

> Runs AFTER all 9 phases. The plan is NOT done until this chain passes.

**Objective:** Validate the changes work across the whole monorepo, including the failure/chaos paths.

### Execution

```
pnpm test            # all package vitest suites (unit + integration)
pnpm typecheck       # tsc --noEmit, zero errors
pnpm lint            # eslint --max-warnings=0, zero warnings
pnpm -r build        # ensure every package still builds
lizard packages -l typescript   # confirm the 8 CC functions reduced
```

Chaos/failure pass (the `## Failure scenarios` rows are encoded as tests in each package's suite — webhook retry, STT/TTS timeout, realtime abort, OIDC cross-host, magic-link body cap):

```
pnpm test            # the failure-scenario tests run as part of each package suite
```

Re-audit:

```
# Re-run the review (or a targeted re-audit) and confirm 0 findings >= low for the 72 IDs
/loop-code-review . high
```

### Acceptance Criteria

- [ ] All package test suites green (unit + integration + failure-scenario tests) — verified by `pnpm test` (exit 0) plus `pnpm typecheck` and `pnpm lint` (0 warnings).
- [ ] Coverage ≥ 90% on changed files (critical paths — currency, webhook, enforceArtifactSecurity, yjs, voice timeout, budget — 100%) — verified by `pnpm test` (exit 0) plus `pnpm typecheck` and `pnpm lint` (0 warnings).
- [ ] Zero type errors; zero lint warnings; every package builds — verified by `pnpm test` (exit 0) plus `pnpm typecheck` and `pnpm lint` (0 warnings).
- [ ] Runtime-metric proof — new counters observed non-zero in integration tests — verified by `pnpm test` (exit 0) plus `pnpm typecheck` and `pnpm lint` (0 warnings).
- [ ] Failure scenarios green — every row of `## Failure scenarios` exercised and observed.
- [ ] Re-audit reports 0 findings ≥ low for the 72 listed IDs (the Goal metric) — verified by `pnpm test` (exit 0) plus `pnpm typecheck` and `pnpm lint` (0 warnings).

### If Validation Fails

1. Separate plan-caused failures from pre-existing.
2. Fix all plan-caused failures before declaring complete.
3. Re-run the chain.
4. Log pre-existing issues in the PR description (do not block on them).
