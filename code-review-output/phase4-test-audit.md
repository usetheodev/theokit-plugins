# Phase 4 -- Test Audit Report

**Date:** 2026-06-11
**Auditor:** test-auditor (Phase 4)
**Target:** theokit-plugins monorepo (11 packages)
**Test framework:** Vitest

---

## 1. Test Inventory Summary

| Package | Test files | Test count | Source files | Coverage assessment |
|---|---|---|---|---|
| auth-github | 1 | 11 | 2 | Adequate |
| auth-google | 2 | 13 | 2 | Adequate |
| auth-magic-link | 1 | 15 | 3 | Excellent |
| plugin-canvas | 12 | 181 | 29 | Good (SQLite adapter gap) |
| plugin-copilot | 10 | 63 | 15 | Good (React components gap) |
| plugin-db-drizzle | 5 | 25 | 5 | Good |
| plugin-email | 4 | 28 | 7 | Moderate (resend-provider gap) |
| plugin-forms | 4 | 16 | 6 | Moderate |
| plugin-payments | 5 | 36 | 8 | Good |
| plugin-realtime | 9 | 48 | 9 | Good |
| plugin-voice | 7 | 75 | 12 | Good |
| **TOTAL** | **60** | **511** | **98** | |

---

## 2. Pyramid Balance

```
Unit tests (mock/stub/fake/spy references): ~217 occurrences across tests
Integration tests (in integration/ dirs):    6 test files
E2E tests:                                   0 dedicated e2e test files
```

**Assessment: HEALTHY pyramid.** The codebase has a large base of unit tests (~50 files, ~470 test cases) and a moderate number of integration tests (6 files covering multi-client presence, Yjs awareness, ORM lifecycle, form integration, real-LLM, and copilot multi-user). No dedicated E2E tests exist, which is acceptable for a plugin library -- E2E coverage belongs in consumer applications that compose these plugins.

---

## 3. Phase 3 Security Findings -- Test Coverage Cross-Reference

### 3.1 SQL Injection in plugin-canvas store.ts -- **NOT COVERED (HIGH)**

Phase 3 identified that `createSqliteArtifactStore` interpolates the `table` parameter directly into SQL strings via template literals. **store.test.ts explicitly acknowledges this gap** (line 1-4 comment: "The SQLite variant is exercised in the dogfood integration"). No test prevents SQL injection through a malicious table name like `"; DROP TABLE users; --`.

- **File:** `packages/plugin-canvas/src/store.ts` lines 198-210, 221, 244-303
- **Evidence:** `${table}` interpolated in 12 SQL statements without validation
- **Test gap:** Complete -- zero SQLite adapter tests in the package

### 3.2 SVG Sanitizer XSS Bypass -- **PARTIALLY COVERED (HIGH)**

sanitize.test.ts covers 7 basic XSS vectors (script tags, on* handlers, javascript: URLs, iframe/object/embed, data: URLs). Missing tests for known regex sanitizer bypasses:

- SVG `<foreignObject>` embedding HTML/script
- Nested/truncated script tags (`<scr<script>ipt>`)
- CSS `expression()` injection via style attributes
- Case-mixed javascript: URIs (`JaVaScRiPt:`)
- Null byte injection in attribute values
- SVG `<use>` element with external reference

### 3.3 Race Condition in plugin-copilot runtime -- **NOT COVERED (MEDIUM)**

No test sends concurrent messages to the same copilot. All runtime.test.ts tests send one broadcast, `await setTimeout(30ms)`, then assert. The `BudgetBridge` uses an in-memory Map without atomicity guarantees -- concurrent charges could lead to budget overruns.

### 3.4 API Key Exposure in plugin-copilot -- **NOT COVERED (HIGH)**

`CopilotRuntime` passes `apiKey` from the copilot descriptor to the agent (runtime.ts:228). No test asserts that API keys do not leak into broadcast payloads, presence updates, or error frames visible to all room participants.

### 3.5 Stripe Webhook Signature Verification -- **COVERED (GOOD)**

webhook.test.ts has strong coverage:
- Valid signature verification (line 117-131)
- Missing signature header (line 133-140)
- Tampered body detection (line 142-155)
- Integration test with processWebhook for signature_invalid status (line 242-263)
- Handler error propagation (line 265-297)
- Idempotency (duplicate delivery, line 194-239)

---

## 4. Flakiness Analysis

### 4.1 setTimeout-based Polling (Flakiness score: 0.3-0.4)

14 test assertions across plugin-copilot use `await new Promise(r => setTimeout(r, N))` with N ranging from 30ms to 200ms. On slow CI runners, these are prone to intermittent failures.

**Affected files:**
- `packages/plugin-copilot/tests/runtime.test.ts` (6 occurrences, 30-50ms)
- `packages/plugin-copilot/tests/trigger-evaluator.test.ts` (1 occurrence, 200ms)
- `packages/plugin-copilot/tests/integration/copilot-room-multi-user.test.ts` (4 occurrences, 40-60ms)
- `packages/plugin-copilot/tests/integration/copilot-real-llm.test.ts` (polling loop, 200ms intervals)
- `packages/plugin-realtime/tests/yjs-provider.test.ts` (1 occurrence, 5ms)
- `packages/plugin-realtime/tests/integration/yjs-awareness-convergence.test.ts` (1 occurrence, 5ms)

### 4.2 Non-deterministic ID Generation (Flakiness score: 0.05)

`packages/plugin-payments/tests/webhook.test.ts` line 22 uses `Math.random()` for event IDs. Unlikely to cause failures but violates determinism principle.

### 4.3 Environment-gated Test (Flakiness score: 0.7)

`copilot-real-llm.test.ts` depends on `OPENROUTER_API_KEY` environment variable and makes real network calls. When the key is set, test success depends on external API availability and response quality. The honest-skip pattern when the key is absent is well-implemented.

---

## 5. Source Files Without Test Coverage

### HIGH priority (business logic or security surface):

| File | Package | Reason |
|---|---|---|
| `src/store.ts` (SQLite adapter half) | plugin-canvas | SQL injection surface; only in-memory variant tested |
| `src/resend-provider.ts` | plugin-email | Email sending adapter with error handling -- zero tests |
| `src/react/CopilotChat.tsx` | plugin-copilot | UI component for copilot chat -- zero tests |
| `src/react/copilot-provider.tsx` | plugin-copilot | React context provider -- zero tests |
| `src/react/hooks.ts` | plugin-copilot | React hooks -- zero tests |

### LOW priority (types, index re-exports, UI chrome):

| File | Package | Reason |
|---|---|---|
| `src/types.ts` | plugin-payments | Type-only; no runtime behavior |
| `src/options.ts` | plugin-payments | Config resolution; tested indirectly via factory.test.ts |
| `src/currency.ts` | plugin-payments | Tested within checkout.test.ts |
| `src/ui/renderers/*.tsx` (8 files) | plugin-canvas | Individual renderers; tested via orchestrator |
| `src/components/TheoForm.tsx` | plugin-forms | React component; partial coverage via hooks |

---

## 6. Test Quality Assessment

### Strengths

- **auth-magic-link tests are exemplary:** fake timers for determinism, concurrent atomicity test (EC-11), email validation (EC-12), error propagation (D8 invariant). This is the model other packages should follow.
- **plugin-payments webhook tests are thorough:** Stripe SDK generateTestHeaderString for realistic signature testing, idempotency verification, handler error propagation.
- **plugin-canvas schema tests are comprehensive:** all 9 artifact kinds, boundary regressions, security defaults, browser-safe Buffer regression. The enforceArtifactSecurity tests cover XSS at the boundary layer.
- **No skipped, commented-out, or todo tests found** across the entire monorepo.
- **No empty/meaningless assertions** (no `expect(true).toBe(true)` patterns).
- **Good AAA structure** across most test files.
- **Error path coverage is generally strong** -- most test files include tests for error/exception scenarios.

### Weaknesses

- **plugin-copilot relies on timing** instead of event-driven completion signals for async assertions.
- **No concurrency tests** exist anywhere in the monorepo (except the good idempotency-store concurrent markProcessed test).
- **React component coverage is weak** across plugin-copilot (5 untested files) and plugin-forms (2 untested components).
- **plugin-email resend-provider.ts** is a complete blind spot -- the actual email-sending adapter has zero coverage.

---

## 7. Findings Summary

| # | Severity | Title | Blocking |
|---|---|---|---|
| 1 | HIGH | SQLite adapter zero test coverage -- SQL injection untested | Yes |
| 2 | HIGH | SVG sanitizer missing tests for regex bypass vectors | Yes |
| 3 | MEDIUM | No concurrency test for CopilotRuntime | No |
| 4 | HIGH | No test verifies API keys not leaked in broadcast payloads | Yes |
| 5 | MEDIUM | 14 tests use setTimeout polling without fake timers | No |
| 6 | MEDIUM | plugin-email resend-provider.ts zero test coverage | No |
| 7 | LOW | plugin-copilot React components have no tests | No |
| 8 | LOW | 8 individual canvas renderers lack dedicated tests | No |
| 9 | LOW | plugin-forms TheoForm/TheoFormContext untested | No |
| 10 | LOW | Non-deterministic event ID in webhook tests | No |
| 11 | LOW | auth-magic-link store.ts tested only via integration | No |

**Blocking findings (3):** SQLite SQL injection gap, SVG sanitizer bypass gap, API key leakage gap.

---

## 8. Recommendations

1. **Immediate (blocking):** Add SQLite adapter tests with SQL injection test cases. Add SVG foreignObject and case-mixed javascript: bypass tests. Add API key non-leakage assertion to copilot runtime tests.

2. **Short-term:** Replace setTimeout polling in copilot tests with event-driven completion signals or vi.useFakeTimers. Add resend-provider.ts test file.

3. **Medium-term:** Add copilot React component tests. Add concurrency tests for CopilotRuntime budget tracking under concurrent load.

---

*Phase 4 complete. 60 test files inspected. 11 findings registered. 3 blocking findings identified.*
