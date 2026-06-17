# Re-Review: remediate-code-review-2026-06-16

**Date:** 2026-06-17
**Type:** Re-review after `NEEDS_FIXES` (prior report `remediate-code-review-2026-06-16-review-2026-06-17.md`)
**Diff scope:** `36b9d17..HEAD` (the 8 fix commits resolving the 4 prior HIGH + 4 owned MEDIUM/LOW)
**Reviewers (spawned agents, model=sonnet):** 6 — architecture, tests, wiring, cross-validation, domain-security, domain-concurrency
**Fix-plan contract:** `knowledge-base/plans/fix-review-findings-2026-06-17-plan.md`

## Verdict: READY_TO_MERGE (with documented MEDIUM/LOW caveats)

The 4 HIGH findings that caused the prior `NEEDS_FIXES` are **all genuinely RESOLVED** (cross-validation evidence below). No BLOCKER and no verified HIGH remain. One reported HIGH was a non-reproducible false positive (discarded with evidence, see below). Remaining findings are MEDIUM/LOW and do not block merge.

## Prior 4-HIGH resolution (cross-validation, with evidence)

| Prior finding | Status | Commit | Evidence |
|---|---|---|---|
| F-wire-1 (recorder onError unwired) | **RESOLVED** | 856c667 | `voice-recorder-bar.tsx:135` passes `{ onError: surface }` to `createRecorder`; test asserts phase=error + onError invoked |
| F-arch-1/F-sec-1 (srcdoc regex verdict bypass) | **RESOLVED** | d173838 | `sanitizeHtmlSrcdoc` migrated to DOMPurify.removed + `classifyRemoved` (WHOLE_DOCUMENT:true); regex removed; 6 vectors incl. unquoted meta-refresh, iframe, on-handler |
| F-arch-2 (round-robin map leak) | **RESOLVED** | 9c35fc8 | `unregisterCopilot` prunes both maps only when `copilotsInRoom===0` after `registry.delete` (ADR D2 guard); rotation regression test passes |
| F-tests-1 (idle+broadcast double-spend untested) | **RESOLVED** | 5b4a803 | `test_idle_and_broadcast_do_not_double_spend` asserts one charge (`dailyUsedUsd==0.01`), `onResponse` once, budget-exceeded broadcast |

Cross-validation task mapping: **7 fully implemented / 1 partial (T2.1 — see F-rr-medium-2) / 0 missing / 0 diverged.**

## Discarded finding (false positive — recorded per honesty rule, not silently dropped)

### F-tests-wire-1 (reported HIGH) — DISCARDED
- **Reported by:** tests agent — claimed `plugin-voice` full suite fails 9/10 due to a DOM leak from `bar_toggles_recording_state` cascading "Found multiple elements by data-testid".
- **Verification (5 independent runs, all GREEN):**
  - `npx vitest run` (full plugin-voice suite): **7 files / 88 tests passed**.
  - `npx vitest run voice-recorder-bar` (isolated file): **10/10 passed**, repeated **3×** — no flakiness.
  - `pnpm --filter @theokit/plugin-voice test` (exact DoD command): **88/88, exit 0**.
- **Conclusion:** not reproducible. Most likely the agent ran in a transiently polluted workspace (it used 80 tool calls / 47 min). A concrete, repeatable green result overrides a non-reproducible red claim. **Not a blocker.** (If a real intermittent leak ever surfaces, the fix would belong in `bar_toggles_recording_state`'s teardown, not in any fix-plan task.)

## MEDIUM findings (surface to human; accept WITH_CAVEATS or follow-up)

### F-rr-medium-1 — OR-fold of removal flags into `removedScript` is an SRP stretch
- **File:** `packages/plugin-canvas/src/ui/renderers/sanitize.ts:168`
- **Found by:** architecture; corroborated by security (sound) + wiring (F-wire-2 below).
- **Summary:** `sanitizeHtmlSrcdoc` folds meta/iframe/object/embed/on-handler/js-url/data-url removals into `removedScript`, encoding a security-policy decision that arguably belongs in `enforceArtifactSecurity` (schema.ts).
- **Disposition:** ACCEPTED — deliberate, documented in fix-plan **ADR D1** (avoids touching schema.ts, which carries the pre-existing backlogged F-arch-5 layering violation). Individual flags stay populated. Remediation tied to F-arch-5 cleanup.

### F-rr-medium-2 — T2.1 test omits the explicit sibling-retention assertion
- **File:** `packages/plugin-copilot/tests/runtime.test.ts` (round-robin prune test)
- **Found by:** tests + cross-validation.
- **Summary:** the prune test proves "room empties → cursor pruned" + "correct fresh rotation" but does not directly assert the plan/ADR-D2 sub-criterion "unregister ONE while a sibling remains → rotation state retained". The production guard at `runtime.ts:134` is correct; only the behavioral assertion is missing.
- **Disposition:** FOLLOW-UP — add the sibling-retention assertion. Not a blocker (guard is correct + covered indirectly; no behavior gap).

## LOW findings (logged; merge can proceed)

| ID | File | Summary | Note |
|---|---|---|---|
| F-wire-2 | plugin-canvas/src/schema.ts | `enforceArtifactSecurity` error message/code still says "meta refresh" / `html-meta-refresh` even when an iframe/on-handler triggers the (now-folded) gate — misleading for debugging | Zero security impact (gate fires). Rename message/code + add schema-boundary test for iframe path. |
| F-sec-1-c | plugin-canvas/src/ui/renderers/sanitize.ts | `<base href>` not in `FORBID_TAGS` — relative resource loads in the srcdoc iframe could be redirected to an attacker domain | Pre-existing; sandbox blocks scripts; defense-in-depth follow-up (cheap: add `'base'` to FORBID_TAGS). |
| F-sec-1-b | plugin-canvas/src/ui/renderers/sanitize.ts | `classifyRemovedAttribute` misses `data:text/javascript` / `data:application/x-javascript` MIME aliases in the boundary verdict | Pre-existing; DOMPurify strips them from output anyway — only the gate has a false-negative. |
| F-sec-3-b | packages/auth-google/src/index.ts | IPv4-mapped IPv6 loopback (`[::ffff:127.0.0.1]`) not recognized as loopback | Over-restrictive (fails CLOSED = safe direction), not a bypass. |
| F-arch-rr-1 | plugin-voice/src/ui/voice-recorder-bar.tsx | `recorderRef.current` not reset to null after `onError` | Pre-existing, not introduced by F-wire-1 fix. |
| F-arch-rr-6 | plugin-canvas/src/ui/renderers/sanitize.ts | `WHOLE_DOCUMENT:true` output shape (full-doc wrapper) not test-pinned for benign HTML | Theoretical only; HTML spec guarantees srcdoc auto-wrap equivalence. |
| F-conc-rr-1 | plugin-copilot/src/internal/runtime.ts:128 | `evaluator.clearRoom` is still unconditional on unregister (clears idle trackers even when siblings remain) — narrower symptom of backlogged F-conc-3 | Not regressed by these fixes; belongs to F-conc-3. |

## Quality gates summary

- plugin-canvas: 217 pass · plugin-copilot: 92 pass (+1 skip) · auth-google: 25 pass · plugin-payments: 60 pass · **plugin-voice: 88 pass** (re-verified — false-positive HIGH refuted).
- tsc: 0 NEW across all affected packages (the 6 plugin-canvas tsc errors are pre-existing baseline in `markdown.tsx` + `use-canvas.test.tsx`, untouched by these fixes).
- lint: 0 NEW (per-file current==HEAD baseline for every edited source file).
- Wiring triad: 8/8 changed symbols pillar (a) pass; (b) covered by co-located boundary tests; (c) n/a (no new metrics).
- code-quality audit: PASS_WITH_CAVEATS (b8bce6f).

## Severity tally (verified)

BLOCKER: 0 · HIGH: 0 (1 reported HIGH discarded as non-reproducible false positive) · MEDIUM: 2 · LOW: 7 · INFO: several

## Spawned agents (audit trail)

- .claude/agents/review-remediate-code-review-2026-06-16-2026-06-17-rereview/architecture.md
- .claude/agents/review-remediate-code-review-2026-06-16-2026-06-17-rereview/tests.md
- .claude/agents/review-remediate-code-review-2026-06-16-2026-06-17-rereview/wiring.md
- .claude/agents/review-remediate-code-review-2026-06-16-2026-06-17-rereview/cross-validation.md
- .claude/agents/review-remediate-code-review-2026-06-16-2026-06-17-rereview/domain-security.md
- .claude/agents/review-remediate-code-review-2026-06-16-2026-06-17-rereview/domain-concurrency.md

## Handoff decision

**READY_TO_MERGE.** The 4 prior HIGH are resolved; no BLOCKER/HIGH remain. The 2 MEDIUM are (1) an ADR-documented accepted trade-off and (2) a test-completeness follow-up; the 7 LOW are pre-existing or cheap defense-in-depth follow-ups. Recommend opening the `develop → main` release PR via `/release`. Suggested follow-up backlog (new cycle, not blocking): F-rr-medium-2 (sibling-retention test), F-wire-2 (stale gate message), F-sec-1-c (`<base>` in FORBID_TAGS), plus the already-backlogged F-conc-1/F-conc-3/F-arch-5.
