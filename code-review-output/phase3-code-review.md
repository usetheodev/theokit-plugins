# Phase 3 Code Review Report

**Repository:** theokit-plugins (TypeScript ESM monorepo, 11 packages)
**Reviewer:** code-reviewer
**Date:** 2026-06-11
**Coverage:** 120/120 non-test source files inspected (100%), 62 test files excluded (out of scope)

---

## Summary

| Severity | Count |
|----------|-------|
| Critical | 1     |
| High     | 4     |
| Medium   | 11    |
| Low      | 10    |
| **Total** | **26** |

> Note: The database also contains findings from earlier phases (complexity, maturity, design-pattern) that were delegated to sub-specialists. This report covers the 26 **code-review** findings added in this phase.

---

## Critical Findings

### CR-1: SQL injection via unescaped table name interpolation in SQLite store
- **File:** `packages/plugin-canvas/src/store.ts:197`
- **Category:** security
- **Description:** `createSqliteArtifactStore` accepts a user-controlled `table` option and interpolates it directly into SQL strings via template literals across 8+ locations (CREATE TABLE, INSERT, SELECT, DELETE). A consumer passing a malicious table name achieves arbitrary SQL execution. Parameterized queries cannot bind SQL identifiers.
- **Impact:** Full database compromise if a consumer passes unsanitized input as the table name.
- **Remediation:** Validate the table name at construction against `/^[a-zA-Z_][a-zA-Z0-9_]*$/`. This is the only safe approach for SQL identifiers.
- **Principle:** OWASP A03:2021 Injection

---

## High Findings

### CR-2: SVG sanitizer regex bypass via newline-separated on-event attributes
- **File:** `packages/plugin-canvas/src/ui/renderers/sanitize.ts:25`
- **Category:** security
- **Description:** `sanitizeSvg` uses regex-based stripping of on-event handlers. The regex requires a whitespace before `on` and operates single-line. SVG payloads with newlines before `onload=` can bypass the regex. For inline SVG rendered via `dangerouslySetInnerHTML` in `svg-artifact.tsx:28`, bypass means XSS in the parent DOM context.
- **Impact:** Cross-site scripting in the parent document when rendering attacker-controlled SVG artifacts.
- **Remediation:** Replace regex sanitization with DOMPurify. Regex-based HTML/SVG sanitization is inherently fragile.

### CR-3: Race condition in CopilotRuntime.handleFrame: concurrent triggers fire without serialization
- **File:** `packages/plugin-copilot/src/internal/runtime.ts:178`
- **Category:** concurrency
- **Description:** `handleFrame` is async but called via `void this.handleFrame(reg, frame)` from the subscription callback. Rapid frames produce concurrent executions with interleaved `runAgent` calls. Budget `preflightCheck` + `charge` are not atomic -- a burst of frames can all pass preflight before any charges, exceeding budget controls.
- **Impact:** Budget controls bypassed under concurrent load; typing indicator state corruption.
- **Remediation:** Serialize frame handling per copilot registration using a queue or mutex pattern.

### CR-4: Swallowed onAfterInsert error silences side-effect failures
- **File:** `packages/plugin-canvas/src/route-handlers.ts:128`
- **Category:** error_handling
- **Description:** The `onAfterInsert` hook error is caught with an empty catch block. If this hook is wired to SSE fan-out (as documented), silent failure means real-time consumers never receive artifact notifications with zero diagnostic trace.
- **Remediation:** Log the error with context. Accept an `onError` callback in options for structured error reporting.

### CR-5: Stripe API key potentially exposed via copilot descriptor serialization
- **File:** `packages/plugin-copilot/src/internal/runtime.ts:228`
- **Category:** security
- **Description:** `defineCopilot` stores `agent.apiKey` (a secret LLM provider key) in the full descriptor. The descriptor is stored in a Map and returned via `getCopilot()`. If the agent throws and the error includes the options object, the key leaks.
- **Remediation:** Accept a `() => string` thunk instead of a string. At minimum, mark the field non-enumerable.

---

## Medium Findings

### CR-6: Mermaid lazy loader race condition
- **File:** `packages/plugin-canvas/src/ui/renderers/mermaid-artifact.tsx:14`
- Concurrent `loadMermaid()` calls can double-initialize Mermaid.
- **Fix:** Apply single-flight pattern (cache the Promise, not the result).

### CR-7: Yjs lazy loader race condition
- **File:** `packages/plugin-realtime/src/yjs-provider.ts:69`
- Same pattern as CR-6.

### CR-8: BudgetBridge uses 30-day fixed window for monthly reset
- **File:** `packages/plugin-copilot/src/internal/budget-bridge.ts:54`
- February resets after 30 days (March 3). Financial accuracy issue.
- **Fix:** Compare against the start of the next calendar month.

### CR-9: CopilotRuntime.deactivate uses unsafe type assertion for undefined
- **File:** `packages/plugin-copilot/src/internal/runtime.ts:155`
- `undefined as unknown as () => void` masks the field type.
- **Fix:** Use optional fields instead.

### CR-10: Listener errors silently swallowed in MemoryRealtimeProvider fanout
- **File:** `packages/plugin-realtime/src/memory-provider.ts:54`
- Empty catch blocks in broadcast loop produce zero diagnostic output.
- **Fix:** Log the error.

### CR-11: Unchecked type assertion in parseListFilter
- **File:** `packages/plugin-canvas/src/route-handlers.ts:70`
- Arbitrary query string cast to ArtifactKind at the HTTP boundary without validation.
- **Fix:** Validate against ARTIFACT_KINDS constant.

### CR-12: ResendProvider discards Resend error code
- **File:** `packages/plugin-email/src/resend-provider.ts:79`
- The Resend error name (e.g., `rate_limit_exceeded`) is not included in the thrown error.

### CR-13: enforceArtifactSecurity has gaps vs renderer sanitizer
- **File:** `packages/plugin-canvas/src/schema.ts:264`
- Boundary gate only checks `<script>` and `javascript:` xlink:href. Misses on-event handlers, non-xlink href, data: URIs.

### CR-14: CopilotRuntime.runAgent swallows agent errors without server-side logging
- **File:** `packages/plugin-copilot/src/internal/runtime.ts:248`
- Broadcasts error to room but no server-side log.

### CR-15: CopilotProvider usage function called once (stale data)
- **File:** `packages/plugin-copilot/src/react/copilot-provider.tsx:92`
- `useMemo(() => usage?.(), [usage])` never re-computes if usage ref is stable.

### CR-16: Internal error messages leaked to HTTP clients
- **File:** `packages/plugin-canvas/src/route-handlers.ts:183`
- 500 error responses include `err.message` which may contain internal details.
- **Fix:** Return generic message for 500s.

### CR-17: Devtools tab iframe lacks sandbox attribute
- **File:** `packages/plugin-db-drizzle/src/devtools.ts:42`
- Unsandboxed iframe to localhost:4983 in developer tools context.

### CR-18: TheoForm handleValid swallows non-validation errors
- **File:** `packages/plugin-forms/src/components/TheoForm.tsx:104`
- Non-ActionInputError exceptions silently caught without rethrow.

---

## Low Findings

| # | File | Title |
|---|------|-------|
| CR-19 | `plugin-copilot/src/react/hooks.ts:61` | useCopilotReadable re-broadcasts on every render for object values |
| CR-20 | `plugin-copilot/src/internal/budget-bridge.ts:50` | Magic literal 86_400_000 without named constant |
| CR-21 | `plugin-copilot/src/react/copilot-provider.tsx:179` | Message cap slicing creates unclear O(n) behavior |
| CR-22 | `plugin-email/src/provider.ts:26` | defineEmailProvider is no-op pass-through (no validation unlike peers) |
| CR-23 | `plugin-copilot/src/react/copilot-provider.tsx:50` | Magic literal 200 for message cap without named constant |
| CR-24 | `plugin-copilot/src/internal/trigger-evaluator.ts:95` | Idle check fires repeatedly without awaiting previous callback |
| CR-25 | `plugin-payments/src/currency.ts:16` | formatAmountForStripe uses Intl heuristic instead of Stripe's zero-decimal list |
| CR-26 | `plugin-voice/src/ui/use-tts.ts:100` | cleanupAudio swallows error without logging |
| CR-27 | `plugin-email/src/magic-link.ts:169` | escapeAttr does not escape single quotes |
| CR-28 | `plugin-payments/src/webhook.ts:88` | WebhookRegistry dispatch fails fast on first handler error (LIFO order) |

---

## Coverage Matrix

| Package | Files Inspected | Findings |
|---------|----------------|----------|
| plugin-canvas | 29/29 | 8 |
| plugin-copilot | 15/15 | 9 |
| plugin-voice | 12/12 | 2 |
| plugin-realtime | 9/9 | 3 |
| plugin-payments | 7/7 | 3 |
| plugin-email | 7/7 | 3 |
| plugin-forms | 5/5 | 1 |
| plugin-db-drizzle | 5/5 | 1 |
| auth-github | 2/2 | 0 |
| auth-google | 2/2 | 0 |
| auth-magic-link | 3/3 | 0 |
| Config files (tsup/vitest) | 24/24 | 0 |
| **Total** | **120/120** | **26** (code-review findings; 143 total in DB including sub-specialist findings) |

---

## Risk Summary

1. **Highest risk:** SQL injection in plugin-canvas store (CR-1). Exploitable if any consumer passes unsanitized input as table name. Simple regex validation fix.

2. **Security cluster:** SVG sanitization is regex-based (CR-2, CR-13) -- inherently fragile. The defence-in-depth design (schema boundary + renderer sanitizer + iframe sandbox) mitigates but does not eliminate the XSS vector for inline SVG rendering via dangerouslySetInnerHTML.

3. **Concurrency cluster:** Three race conditions (CR-3, CR-6, CR-7) share the same root cause: async singleton initialization without single-flight. The CopilotRuntime race (CR-3) has financial impact (budget bypass).

4. **Error handling cluster:** Five findings (CR-4, CR-10, CR-14, CR-16, CR-18) share the pattern of swallowed errors. The codebase has clear error hierarchies (typed error classes) but the catch blocks often discard context.
