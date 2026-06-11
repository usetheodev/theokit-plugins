# Edge Case Review — fix-code-review-findings

Date: 2026-06-11
Tasks analyzed: 20
Edge cases found: 7 (MUST FIX: 3, SHOULD TEST: 2, DOCUMENT: 2)

## MUST FIX

### EC-1: DOMPurify `removed` shape incompatible with boolean `SanitizeReport`
- **Affected task:** T1.2
- **Family:** Format
- **Scenario:** Current `SanitizeResult.report` has 7 boolean fields (`removedScript`, `removedIframe`, etc.). DOMPurify's `removed` API returns `Array<{element, type, attribute}>` — a fundamentally different shape. Naively swapping the implementation would break the return type contract.
- **Impact:** Callers reading `report.removedScript` would get `undefined` instead of a boolean. Silent type error at runtime if not caught by TypeScript.
- **Suggested fix:** Map DOMPurify's `removed` array to the existing boolean flags: `removedScript: removed.some(r => r.element?.tagName === 'SCRIPT')`. Keeps the public `SanitizeResult` interface stable.

### EC-2: WebhookRegistry AggregateError is a breaking change
- **Affected task:** T3.5
- **Family:** State / Contract
- **Scenario:** Current behavior: `dispatch()` throws the first handler error and stops. The test suite explicitly asserts `.rejects.toThrow("user handler failed")`. The caller `processWebhook()` catches a single `Error` and inspects it. Changing to AggregateError: (a) breaks the existing test, (b) changes `error instanceof SpecificError` checks in consumer code, (c) alters LIFO semantics from "halt on failure" to "run all then throw aggregate".
- **Impact:** Breaking change for consumers that inspect the error type. Existing test will fail.
- **Suggested fix:** Change the ADR to: collect errors but throw the **first** error (preserving current contract); log the remaining errors. If all-or-nothing semantics are desired, add a `dispatchAll()` method that returns `AggregateError` — never change the existing `dispatch()` contract in a 0.x release.

### EC-3: CopilotRuntime.deactivate does not drain the Promise queue
- **Affected task:** T2.1
- **Family:** Timing / State
- **Scenario:** T2.1 adds a per-registration Promise queue. But `deactivate()` at line 151 immediately calls `reg.unsubscribeRoom()` and `reg.member.leave()` without awaiting pending queue items. In-flight `runAgent` promises will continue executing after `leave()` — broadcasting to a room the member already left, causing errors or dropped messages.
- **Impact:** Race between deactivate and in-flight agent operations. Agent broadcasts fail silently or throw after member has left the room.
- **Suggested fix:** In `deactivate()`, `await this.queues.get(copilotId)` before calling `reg.member.leave()`. This drains pending work before teardown.

## SHOULD TEST

### EC-4: BudgetBridge month boundary migration on upgrade
- **Affected task:** T2.3
- **Family:** State
- **Scenario:** If an app serializes `monthStartMs` (e.g., to a database) under the old 30-day logic and then upgrades, the first call post-upgrade computes `startOfNextMonth(oldMonthStartMs)` which may differ from `oldMonthStartMs + 30 * 86_400_000`. This could cause a premature reset (e.g., Dec 15 → the old logic wouldn't reset until Jan 14, but the new logic resets Jan 1) or a missed reset depending on the date.
- **Suggested test:** `test_budget_migration_from_30day_to_calendar_boundary()` — construct a BudgetBridge with `monthStartMs` set to Nov 15 (old-style mid-month), advance clock to Dec 1 (calendar boundary but only 15 days elapsed), assert the reset triggers correctly. Note: BudgetBridge currently uses in-memory `Map` only — if no persistence exists, this is DOCUMENT-grade. Verify by checking if `BudgetState` is ever serialized.

### EC-5: Reducer decomposition — verify CC=158 is actually in the reducer
- **Affected task:** T5.1
- **Family:** Boundary
- **Scenario:** Code review shows the reducer has only 7 cases across ~55 lines. The CC=158 measured by lizard may include the entire file (325 LoC) or the `useCanvas` hook which wraps the reducer with additional state management, effects, and callbacks. If the CC=158 is in the hook (not the reducer), extracting reducer cases into handlers won't significantly reduce CC.
- **Suggested test:** Run `lizard packages/plugin-canvas/src/ui/use-canvas.ts` before starting T5.1 to identify which function has CC=158. If it's `useCanvas` (the hook) rather than `reducer`, the decomposition target changes from "extract reducer cases" to "extract hook effects and callbacks."

## DOCUMENT

### EC-6: SQL injection risk is config-time only
- **Affected task:** T1.1
- **Family:** Input
- **Scenario:** The `table` parameter in `createSqliteArtifactStore()` is developer-supplied at construction time (line 178: `options.table ?? 'canvas_artifacts'`). It never comes from user input, HTTP request, or any runtime source. All data values use parameterized bindings (line 220+). The SQL injection is real as a defense-in-depth concern but not exploitable via the plugin's public API as designed.
- **Accepted risk:** The fix (T1.1) is still worth doing as defense-in-depth — a future consumer might pass untrusted input to `table`. But this should be classified as MEDIUM (not CRITICAL) in the plan's severity assessment. The plan can proceed as-is.

### EC-7: API key thunk pattern may be unnecessary
- **Affected task:** T1.3
- **Family:** Format
- **Scenario:** `CopilotAgentConfig.apiKey` is typed as `string | undefined` (not user input). The value is set at definition time in `defineCopilot()` — typically `process.env.OPENROUTER_API_KEY`. The key is passed to `Agent.streamObject({ apiKey })` which expects a `string`. Changing to `string | (() => string)` adds type complexity without proven benefit — the key doesn't appear in broadcast payloads (it's spread into the SDK call, not into the frame). The real risk is SDK-level logging, which is outside this plugin's control.
- **Accepted risk:** The simpler fix is to verify the key is NOT included in error payloads or broadcast frames (just a test assertion per T4.3) rather than introducing a thunk pattern. If the test passes without code changes, T1.3's implementation scope reduces to "add the non-leakage test only."

## Summary

| Task | Edges found | MUST FIX | SHOULD TEST | DOCUMENT |
|------|-------------|----------|-------------|----------|
| T1.1 | 1 | 0 | 0 | 1 |
| T1.2 | 1 | 1 | 0 | 0 |
| T1.3 | 1 | 0 | 0 | 1 |
| T1.4 | 0 | 0 | 0 | 0 |
| T1.5 | 0 | 0 | 0 | 0 |
| T2.1 | 1 | 1 | 0 | 0 |
| T2.2 | 0 | 0 | 0 | 0 |
| T2.3 | 1 | 0 | 1 | 0 |
| T2.4 | 0 | 0 | 0 | 0 |
| T3.1–T3.4 | 0 | 0 | 0 | 0 |
| T3.5 | 1 | 1 | 0 | 0 |
| T3.6 | 0 | 0 | 0 | 0 |
| T4.1–T4.3 | 0 | 0 | 0 | 0 |
| T5.1 | 1 | 0 | 1 | 0 |
| T5.2–T5.3 | 0 | 0 | 0 | 0 |
| T6.1–T6.2 | 0 | 0 | 0 | 0 |

**Verdict:** PLAN NEEDS ADJUSTMENT — 3 MUST FIX items require plan revision before `/plan-confidence`.
