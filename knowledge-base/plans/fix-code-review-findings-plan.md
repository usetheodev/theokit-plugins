# Plan: Fix All Code Review Findings

> **Version 1.1** — Remediate all 23 blocking and significant non-blocking findings surfaced by the loop-code-review v0.3.0 audit of the theokit-plugins monorepo. The plan addresses security vulnerabilities (SQL injection, XSS bypass, API key exposure), correctness bugs (race conditions, month calculation, error swallowing), test coverage gaps, and the top-3 complexity hotspots. Scoped to production code fixes + regression tests; complexity reduction is limited to the three worst offenders (CC>95). **v1.1 absorbs 3 MUST FIX edge cases from `/edge-case-plan` (EC-1, EC-2, EC-3).**

## Goal

> "Reduce the blocking finding count from 23 to 0 and cap every security-critical function's test coverage at 100%, measured by `pnpm test` passing with zero blocking findings when `/code-quality` re-runs."

## Context

The loop-code-review v0.3.0 full audit (2026-06-11) inspected 182 files (100% coverage) across all 11 packages and surfaced 166 findings — 27 critical, 44 high, 34 medium, 34 low, 27 info. Of these, 23 are blocking (must-fix). The critical mass concentrates in two areas: (1) security vulnerabilities in plugin-canvas (SQL injection in store.ts, regex-based SVG sanitization bypass, error message leakage) and plugin-copilot (API key exposure, race condition enabling budget bypass); (2) extreme cyclomatic complexity in plugin-canvas (reducer CC=158, CanvasPanel CC=115, createSqliteArtifactStore CC=97). The test audit revealed zero coverage on the SQLite adapter path, missing SVG sanitizer bypass vectors, and no API key non-leakage assertion.

Full report: `code-review-output/REVIEW-REPORT.md`.

## Baseline Context (deep review of current state)

### Files that will be touched

| File | LoC today | Last commit (sha + date) | Why it exists today | Invariants to preserve |
|---|---|---|---|---|
| `packages/plugin-canvas/src/store.ts` | 324 | `f5188bd` (2026-05-30) | ArtifactStore interface + in-memory + SQLite implementations | `ArtifactStore` interface shape; in-memory impl unchanged |
| `packages/plugin-canvas/src/ui/renderers/sanitize.ts` | 110 | `f5188bd` (2026-05-30) | Regex-based SVG/HTML sanitization | `sanitizeSvg()` and `sanitizeHtmlSrcdoc()` public API signature |
| `packages/plugin-canvas/src/route-handlers.ts` | 185 | `f5188bd` (2026-05-30) | HTTP route handlers for artifact CRUD | `createArtifactRouteHandlers()` signature; REST contract |
| `packages/plugin-canvas/src/schema.ts` | 287 | `fdc0eb5` (2026-06-03) | Zod schemas + `enforceArtifactSecurity()` | Artifact type union; Zod schema shapes for consumers |
| `packages/plugin-canvas/src/ui/use-canvas.ts` | 325 | `fdc0eb5` (2026-06-03) | Canvas state reducer + React hook | `useCanvas()` hook public API unchanged |
| `packages/plugin-canvas/src/ui/canvas-panel.tsx` | 236 | `fdc0eb5` (2026-06-03) | Main canvas panel React component | `CanvasPanel` props interface |
| `packages/plugin-canvas/src/ui/renderers/mermaid-artifact.tsx` | 92 | `fdc0eb5` (2026-06-03) | Lazy-loaded mermaid renderer | Render output unchanged |
| `packages/plugin-copilot/src/internal/runtime.ts` | 299 | `69b9a30` (2026-06-04) | CopilotRuntime orchestrator — agent invocation + broadcast | `CopilotRuntime` public class API |
| `packages/plugin-copilot/src/internal/budget-bridge.ts` | 118 | `69b9a30` (2026-06-04) | Budget tracking per registration | `BudgetBridge` constructor + `charge()` + `remaining()` API |
| `packages/plugin-copilot/src/react/copilot-provider.tsx` | 186 | `69b9a30` (2026-06-04) | React context provider for copilot state | `CopilotProvider` props interface |
| `packages/plugin-realtime/src/yjs-provider.ts` | 272 | `0c4566a` (2026-06-04) | Yjs CRDT provider + lazy loader | `YjsRealtimeProvider` implements `RealtimeProvider` |
| `packages/plugin-realtime/src/memory-provider.ts` | 145 | `0c4566a` (2026-06-04) | In-memory realtime provider (dev/test) | `MemoryRealtimeProvider` implements `RealtimeProvider` |
| `packages/plugin-payments/src/webhook.ts` | 183 | `d5ebfb4` (2026-06-04) | Stripe webhook registry + dispatch | `WebhookRegistry` interface; LIFO dispatch order |
| `packages/plugin-forms/src/components/TheoForm.tsx` | 187 | `e74cf41` (2026-06-03) | Declarative form component | `TheoForm` props interface |
| `packages/plugin-email/src/resend-provider.ts` | 134 | `3f5ada6` (2026-06-04) | Resend email adapter | `ResendProvider` implements `EmailProvider` |
| `packages/plugin-db-drizzle/src/devtools.ts` | 52 | `1766ed0` (2026-06-04) | Drizzle Studio devtools tab | `buildDevtoolsTab()` signature |
| `packages/plugin-canvas/tests/store.test.ts` | 161 | `f5188bd` (2026-05-30) | Tests for in-memory ArtifactStore only | Existing tests stay green |
| `packages/plugin-canvas/tests/sanitize.test.ts` | 79 | `f5188bd` (2026-05-30) | 7 basic XSS vector tests | Existing tests stay green |
| `packages/plugin-copilot/tests/runtime.test.ts` | 271 | `69b9a30` (2026-06-04) | CopilotRuntime unit tests | Existing tests stay green |
| `packages/plugin-copilot/tests/budget-bridge.test.ts` (NEW) | 0 | — | (file to be created) | — |
| `packages/plugin-realtime/tests/memory-provider.test.ts` | exists | `0c4566a` (2026-06-04) | MemoryRealtimeProvider tests | Existing tests stay green |
| `packages/plugin-payments/tests/webhook.test.ts` | exists | `d5ebfb4` (2026-06-04) | Webhook dispatch tests | Existing tests stay green |
| `packages/plugin-email/tests/resend-provider.test.ts` (NEW) | 0 | — | (file to be created) | — |
| `packages/plugin-voice/README.md` | 115 | `f5188bd` (2026-05-30) | Plugin documentation | — |
| `packages/plugin-realtime/README.md` | 161 | `0c4566a` (2026-06-04) | Plugin documentation | — |

### Current callers / dependents

- **`createSqliteArtifactStore()`** in `store.ts` — Callers: `packages/plugin-canvas/src/index.ts` (re-export), `tests/store.test.ts`. External: consumers via `@theokit/plugin-canvas`.
- **`sanitizeSvg()` / `sanitizeHtmlSrcdoc()`** in `sanitize.ts` — Callers: `svg-artifact.tsx:17`, `html-artifact.tsx`, `tests/sanitize.test.ts`.
- **`CopilotRuntime`** in `runtime.ts` — Callers: `define-copilot.ts:74`, `tests/runtime.test.ts`.
- **`enforceArtifactSecurity()`** in `schema.ts` — Callers: `define-artifact-tool.ts:169`, `route-handlers.ts:111`.
- **`BudgetBridge`** in `budget-bridge.ts` — Callers: `runtime.ts`, `tests/runtime.test.ts` (indirectly).
- **`createArtifactRouteHandlers()`** in `route-handlers.ts` — Callers: `index.ts` (re-export), `tests/route-handlers.test.ts`.
- **`WebhookRegistry`** in `webhook.ts` — Callers: `index.ts`, `tests/webhook.test.ts`.

### Domain glossary

- **ArtifactStore** — persistence interface for canvas artifacts (markdown/code/svg/html/mermaid), with in-memory and SQLite implementations.
- **Wiring triad** — caller + integration test + runtime metric — the three pillars proving a feature is production-connected.
- **Budget bridge** — per-registration token budget tracker that resets monthly, used to cap LLM API spend per copilot instance.
- **Lazy loader** — module-level singleton pattern that dynamically imports heavy deps (mermaid, yjs) on first use.
- **Single-flight** — concurrency pattern ensuring only one in-flight request per key; subsequent callers wait for the first result.

### Architecture boundaries affected

Per `rules/architecture.md`:
- **Domain ↔ Infrastructure boundary** — `ArtifactStore` interface (domain) vs `createSqliteArtifactStore` (infrastructure adapter). SQL injection fix stays within the adapter; interface unchanged.
- **Interface ↔ Application boundary** — `route-handlers.ts` (interface layer) delegates to store (infrastructure). Error sanitization is an interface-layer concern.
- **No cross-boundary violations** — all fixes stay within their respective layers.

## Prior Art & Related Work

- **DOMPurify** (external library, https://github.com/cure53/DOMPurify) — industry-standard DOM-based HTML/SVG sanitizer. Replaces regex-based approach per OWASP recommendation. MIT license, 14k+ stars, weekly releases, battle-tested.
- **Single-flight pattern** — Go stdlib `singleflight` package; adapted to TypeScript as a Promise-caching pattern. Well-documented in Node.js ecosystem.
- (none identified internally — no blueprints or patterns skills match this remediation scope)

## Objective

- [ ] O1 — Fix all 7 security findings (SQL injection, SVG sanitizer, API key exposure, error leak, iframe sandbox, enforceArtifactSecurity, escapeAttr)
- [ ] O2 — Fix all 4 concurrency findings (CopilotRuntime race, mermaid lazy loader, Yjs lazy loader, TriggerEvaluator)
- [ ] O3 — Fix all 6 error handling findings (swallowed errors in route-handlers, memory-provider, copilot runtime, TheoForm, resend-provider, webhook dispatch)
- [ ] O4 — Fix all 4 contract findings (BudgetBridge month calc, ArtifactKind assertion, CopilotProvider usage, deactivate undefined)
- [ ] O5 — Add missing security regression tests (SQLite injection, SVG bypass vectors, API key non-leakage)
- [ ] O6 — Reduce top-3 complexity hotspots below CC=25 (reducer, CanvasPanel, createSqliteArtifactStore)
- [ ] O7 — Update stale documentation (plugin-voice README, plugin-realtime README)

## ADRs

### D1 — Replace regex SVG sanitization with DOMPurify

**Decision:** Replace the 7-regex sanitization pipeline in `sanitize.ts` with DOMPurify (DOM-based parsing + allowlist).

**Rationale:** Regex-based HTML/SVG sanitization is fundamentally flawed — it cannot handle all encoding variations, nested contexts, or parser differentials (OWASP). DOMPurify is the industry standard (Rule 9 — don't reinvent the wheel), MIT-licensed, 14k+ stars, weekly releases. Per `architecture.md`, the sanitizer is infrastructure-layer; swapping implementation behind the same interface respects DIP.

**Alternatives considered:**
- Keep regex + add more patterns — rejected: whack-a-mole; new bypass vectors will surface. Regex cannot model HTML grammar.
- Use `sanitize-html` — rejected: heavier, less SVG-aware, fewer maintainers than DOMPurify.

**Consequences:** Adds `isomorphic-dompurify` as dependency (~25KB gzipped). Server-side rendering needs jsdom (already a devDep). Consumers see no API change.

### D2 — Single-flight pattern for lazy loaders

**Decision:** Apply Promise-caching single-flight pattern to mermaid and Yjs lazy loaders.

**Rationale:** Module-level `let instance = null` + `let error = false` is a known anti-pattern for async initialization — concurrent calls race, and cached errors permanently disable the module (KISS violation — error cache adds complexity without value). Single-flight is the canonical solution (Go stdlib, Node.js ecosystem).

**Alternatives considered:**
- Mutex/lock — rejected: overkill for a one-shot initialization; single-flight is simpler.
- Per-component lazy loading — rejected: would re-import on every mount; wasteful.

**Consequences:** Lazy loaders become idempotent and retry-safe. Error is not cached; next caller retries.

### D3 — Validate SQL identifiers at construction time

**Decision:** Validate table name against `/^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/` in `createSqliteArtifactStore()` constructor. Throw `TypeError` if invalid.

**Rationale:** SQL identifiers cannot be parameterized in SQLite prepared statements. Validation at construction (fail-fast, Rule 8) prevents injection at every query site. The regex matches SQLite identifier rules exactly.

**Alternatives considered:**
- Allowlist of known table names — rejected: too rigid; consumers must name their own tables.
- Quote identifiers with double-quotes — rejected: still vulnerable to double-quote injection if not escaped; validation is simpler and more robust.

**Consequences:** Breaking change only for consumers passing invalid table names (e.g., containing spaces or SQL keywords as identifiers). This is the correct behavior.

### D4 — Complexity reduction via extract-function refactoring

**Decision:** Decompose the top-3 CC hotspots using extract-function pattern: reducer → per-action handlers, CanvasPanel → sub-components, createSqliteArtifactStore → per-query methods.

**Rationale:** CC > 25 is classified "untestable" per McCabe/NIST consensus. The reducer at CC=158 is 15x the threshold. Extract-function is the lowest-risk refactoring pattern — no behavior change, only structural decomposition (KISS — each function does one thing).

**Alternatives considered:**
- Leave as-is with suppression comment — rejected: 158 CC is a testing impossibility, not a style preference.
- Full state machine library (xstate) — rejected: YAGNI; the action types are stable and the reducer pattern is idiomatic React.

**Consequences:** More files in `plugin-canvas/src/ui/`, but each under 50 LoC with CC < 10. Test coverage becomes feasible.

## Drawbacks & Risks

| Drawback / Risk | Severity | Mitigation | Owner |
|---|---|---|---|
| DOMPurify adds ~25KB to client bundle for plugin-canvas consumers | Low | Tree-shakeable; only imported in SVG/HTML renderers; `isomorphic-dompurify` supports SSR | Developer |
| Reducer decomposition must break snapshot tests if any exist | Medium | Run `pnpm test` per-package after each extraction; update snapshots if shape changed | Developer |
| BudgetBridge month-boundary change alters reset timing for existing users | Low | Document in CHANGELOG; new behavior is correct (calendar months vs arbitrary 30-day windows) | Developer |
| Webhook dispatch behavior change (continue-on-error vs stop-on-first) | Medium | Document in CHANGELOG as Changed; consumers relying on stop-on-first can wrap handlers | Developer |

## Unresolved Questions

- Q1 — Must `sanitizeSvg` strip or replace with placeholder when DOMPurify removes content? Current behavior replaces with HTML comments. DOMPurify default is silent strip. **Decision deferred to implementation — preserve current comment-replacement behavior via DOMPurify hooks.**
- Q2 — Must `WebhookRegistry.dispatch` collect all handler errors and throw an `AggregateError`, or log individual errors and succeed? **Leaning toward AggregateError for consistency with Promise.allSettled semantics, but need to verify consumer expectations.**

## Dependency Graph

```
Phase 1 (Security) ──▶ Phase 2 (Correctness) ──▶ Phase 3 (Error Handling) ──▶ Phase 4 (Tests) ──▶ Phase 5 (Complexity) ──▶ Phase 6 (Docs) ──▶ Integration Validation
```

All phases are sequential — security fixes land first because they have the highest blast radius. Tests in Phase 4 cover all fixes from Phases 1-3. Complexity reduction in Phase 5 is independent but benefits from Phase 4 test coverage as a safety net.

---

## Phase 1: Security Fixes

**Objective:** Eliminate all 7 security findings — SQL injection, SVG sanitizer bypass, API key exposure, error message leakage, iframe sandbox, enforceArtifactSecurity gaps, escapeAttr.

### T1.1 — Fix SQL injection in createSqliteArtifactStore

#### Objective
Validate the `table` parameter at construction time to prevent SQL injection via interpolated identifiers.

#### Why this step (action + reasoning — ReAct discipline)

This step adds a regex guard at the `createSqliteArtifactStore()` constructor that validates the table name against SQLite identifier rules. Any invalid name throws a `TypeError` immediately.

This is the highest-priority fix because SQL injection is the only CRITICAL-severity finding in the entire review (finding #108). Per D3, validation at construction is fail-fast (Rule 8) and eliminates the risk at all 12 query sites simultaneously. Parameterized queries cannot protect DDL identifiers — this is a known SQLite limitation.

#### Evidence
- `store.ts:198-211` — 12 template-literal SQL statements interpolate `${table}` directly.
- Finding #108 in `code-review-output/REVIEW-REPORT.md` — severity critical, category security.
- OWASP A03:2021 (Injection) — SQL identifier injection is a recognized attack vector.

#### Files to edit
```
packages/plugin-canvas/src/store.ts — add table name validation regex at construction
packages/plugin-canvas/tests/store.test.ts — add SQL injection regression tests
```

#### Deep file dependency analysis
- **store.ts** (324 LoC) — holds `ArtifactStore` interface + two implementations. The `createSqliteArtifactStore(opts)` factory accepts `opts.table` (string). This task adds validation to the factory; interface unchanged. Callers: `index.ts` (re-export), `tests/store.test.ts`.
- **store.test.ts** (161 LoC) — currently tests only the in-memory implementation. This task adds SQLite adapter test cases.

#### Deep Dives
- **Validation regex:** `/^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/` — matches SQLite identifier rules. Max 63 chars (SQLite internal limit).
- **Invariant:** `ArtifactStore` interface is unchanged. Only the SQLite factory constructor gains validation.
- **Edge cases:** empty string, string with spaces, SQL keywords (`DROP`, `SELECT`), strings with quotes, unicode characters — all rejected by the regex.

#### Pseudo-code / Signatures

```pseudocode
const VALID_TABLE_NAME = /^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/;

function createSqliteArtifactStore(opts: SqliteArtifactStoreOptions): ArtifactStore {
  if (!VALID_TABLE_NAME.test(opts.table)) {
    throw new TypeError(`Invalid table name: "${opts.table}". Must match /^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/.`);
  }
  // ... existing implementation
}

# Example
input:  { table: "artifacts; DROP TABLE users--" }
output: TypeError("Invalid table name: ...")
```

#### Tasks
1. Add `VALID_TABLE_NAME` constant and validation check at the top of `createSqliteArtifactStore()`.
2. Write regression tests for invalid table names.
3. Verify all existing tests pass.

#### TDD
```
RED:     test_sqlite_store_rejects_table_name_with_sql_injection() — expects TypeError for "artifacts; DROP TABLE users--"
RED:     test_sqlite_store_rejects_empty_table_name() — expects TypeError for ""
RED:     test_sqlite_store_rejects_table_name_with_spaces() — expects TypeError for "my table"
RED:     test_sqlite_store_accepts_valid_table_name() — expects no error for "canvas_artifacts"
GREEN:   Add VALID_TABLE_NAME regex + validation in createSqliteArtifactStore constructor
REFACTOR: None expected
VERIFY:  cd packages/plugin-canvas && pnpm test
```

#### Concurrency tests

(none — single-threaded)

#### Acceptance Criteria
- [ ] `createSqliteArtifactStore({ table: "x; DROP TABLE y--" })` throws TypeError
- [ ] `createSqliteArtifactStore({ table: "valid_name" })` succeeds
- [ ] All 4 new tests pass — `cd packages/plugin-canvas && pnpm test` exits 0
- [ ] All existing store tests pass — `cd packages/plugin-canvas && pnpm test` exits 0
- [ ] Pass: lint — `pnpm lint` returns exit code 0 with 0 warnings on changed files
- [ ] Pass: size — `wc -l packages/plugin-canvas/src/store.ts` ≤ 500

#### DoD (Definition of Done)
- [ ] All tasks completed and validated
- [ ] All tests pass — `pnpm test` exits 0ing — `cd packages/plugin-canvas && pnpm test` green
- [ ] Zero type errors — `pnpm typecheck` exits 0 — `pnpm typecheck`
- [ ] Zero lint warnings — `pnpm lint` exits 0 — `pnpm lint`

---

### T1.2 — Replace regex SVG/HTML sanitization with DOMPurify

#### Objective
Replace the regex-based sanitization pipeline with DOMPurify to eliminate the class of XSS bypass vectors inherent to regex-based HTML parsing.

#### Why this step (action + reasoning — ReAct discipline)

This step replaces the 7-regex pipeline in `sanitize.ts` with DOMPurify calls, preserving the `SanitizeResult` return type (with `stripped` array and `clean` output).

Per D1, regex cannot model HTML grammar — every new bypass vector requires a new regex, creating a whack-a-mole dynamic. DOMPurify is the OWASP-recommended solution (Rule 9 — don't reinvent). Finding #129 (SVG sanitizer bypass) and #140 (enforceArtifactSecurity gaps) are both eliminated by this change.

#### Evidence
- `sanitize.ts:21-27` — 7 inline regex patterns for attack surface removal.
- Finding #129 — SVG sanitizer regex bypass via newlines in on-event attributes.
- Finding #140 — `enforceArtifactSecurity` misses on-event handlers and data: URI vectors.
- OWASP XSS Prevention Cheat Sheet — regex sanitization is listed as an anti-pattern.

#### Files to edit
```
packages/plugin-canvas/package.json — add isomorphic-dompurify dependency
packages/plugin-canvas/src/ui/renderers/sanitize.ts — replace regex with DOMPurify
packages/plugin-canvas/src/schema.ts — update enforceArtifactSecurity to delegate to sanitize module
packages/plugin-canvas/tests/sanitize.test.ts — add bypass vector regression tests
```

#### Deep file dependency analysis
- **sanitize.ts** (110 LoC) — exports `sanitizeSvg()` and `sanitizeHtmlSrcdoc()`. Callers: `svg-artifact.tsx:17`, `html-artifact.tsx`, `tests/sanitize.test.ts`. Return type `SanitizeResult` is preserved.
- **schema.ts** (287 LoC) — `enforceArtifactSecurity()` at line 264 does its own regex checks. This task makes it delegate to the centralized sanitizer for SVG/HTML kinds, removing duplicate defense logic.
- **sanitize.test.ts** (79 LoC) — existing 7 tests stay; new bypass vector tests added.

#### Deep Dives
- **DOMPurify config:** `ALLOWED_TAGS` for SVG: geometric elements + text + defs + use (no script, no foreignObject). `FORBID_ATTR`: on* events, xlink:href with javascript: protocol.
- **`SanitizeResult` preservation (EC-1 MUST FIX):** Current `SanitizeReport` has 7 boolean fields (`removedScript`, `removedIframe`, etc.). DOMPurify's `removed` API returns `Array<{element, type, attribute}>` — a fundamentally different shape. The implementation MUST map DOMPurify's `removed` array to the existing boolean flags to preserve the public `SanitizeResult` interface. Mapping logic: `removedScript: removed.some(r => r.element?.tagName === 'SCRIPT')`, `removedIframe: removed.some(r => r.element?.tagName === 'IFRAME')`, etc. The `clean` field gets DOMPurify's sanitized output. This mapping is lossy (count of removed items is lost) but preserves the boolean contract.
- **SSR compatibility:** `isomorphic-dompurify` works in Node.js (uses jsdom) and browser. jsdom is already a devDep. Sanitize functions are client-only (called from svg-artifact.tsx, html-artifact.tsx — both React components).
- **Edge cases:** `<foreignObject>` stripped, case-mixed `jAvAsCrIpT:` caught, CSS `expression()` stripped, null bytes removed, `<use>` with external xlink:href stripped.

#### Pseudo-code / Signatures (EC-1 mapping)

```pseudocode
import DOMPurify from 'isomorphic-dompurify';

function sanitizeSvg(input: string): SanitizeResult {
  const removed: Array<{element?: Element; attribute?: string}> = [];
  DOMPurify.addHook('uponSanitizeElement', (node, data) => {
    if (data.tagName && !ALLOWED_SVG_TAGS.has(data.tagName)) {
      removed.push({ element: node as Element });
    }
  });
  const output = DOMPurify.sanitize(input, SVG_CONFIG);
  DOMPurify.removeAllHooks();

  const report: SanitizeReport = {
    removedScript:    removed.some(r => r.element?.tagName === 'SCRIPT'),
    removedIframe:    removed.some(r => r.element?.tagName === 'IFRAME'),
    removedEmbed:     removed.some(r => r.element?.tagName === 'EMBED' || r.element?.tagName === 'OBJECT'),
    removedOnEvent:   removed.some(r => r.attribute?.startsWith('on')),
    removedJsUri:     removed.some(r => /* detected via FORBID_ATTR */),
    removedDataUri:   removed.some(r => /* detected via ALLOWED_URI_REGEXP */),
    removedForeignObj: removed.some(r => r.element?.tagName === 'foreignObject'),
  };
  return { output, report };
}
```

#### Tasks
1. Add `isomorphic-dompurify` to plugin-canvas dependencies.
2. Rewrite `sanitizeSvg()` using DOMPurify with SVG-specific config.
3. **Map DOMPurify `removed` array to existing boolean `SanitizeReport` fields (EC-1).** Use `uponSanitizeElement` / `uponSanitizeAttribute` hooks to capture removed items, then convert to the 7 boolean flags. This preserves the public `SanitizeResult` interface contract.
4. Rewrite `sanitizeHtmlSrcdoc()` using DOMPurify with HTML config (same mapping pattern).
5. Update `enforceArtifactSecurity()` in schema.ts to delegate SVG/HTML checks to the sanitize module.
6. Add bypass vector regression tests.
7. Verify all existing sanitize tests still pass — especially tests that assert on `report.removedScript === true`.

#### TDD
```
RED:     test_sanitize_svg_strips_foreignObject() — expects <foreignObject> removed
RED:     test_sanitize_svg_strips_nested_script_in_defs() — expects <script> inside <defs> removed
RED:     test_sanitize_svg_strips_case_mixed_javascript_uri() — expects jAvAsCrIpT: href removed
RED:     test_sanitize_svg_strips_css_expression() — expects expression() in style removed
RED:     test_sanitize_svg_strips_null_byte_script() — expects <scr\x00ipt> removed
RED:     test_sanitize_svg_strips_use_external_xlink() — expects <use xlink:href="http://evil"> removed
RED:     test_sanitize_html_strips_meta_refresh() — expects <meta http-equiv="refresh"> removed
GREEN:   Replace regex pipeline with DOMPurify in sanitize.ts
REFACTOR: Remove duplicate checks from enforceArtifactSecurity in schema.ts
VERIFY:  cd packages/plugin-canvas && pnpm test
```

#### Concurrency tests

(none — single-threaded)

#### Acceptance Criteria
- [ ] All 7 existing sanitize tests pass unchanged (boolean `SanitizeReport` fields preserved — EC-1)
- [ ] All 7 new bypass vector tests pass — `cd packages/plugin-canvas && pnpm test` exits 0
- [ ] `enforceArtifactSecurity()` delegates to sanitize module (no duplicate regex)
- [ ] `isomorphic-dompurify` in plugin-canvas package.json dependencies
- [ ] `SanitizeResult` type is unchanged — callers reading `report.removedScript` etc. work as before (EC-1)
- [ ] Pass: lint — `pnpm lint` returns exit code 0 with 0 warnings
- [ ] Pass: size — `wc -l packages/plugin-canvas/src/ui/renderers/sanitize.ts` ≤ 500

#### DoD (Definition of Done)
- [ ] All tests pass — `pnpm test` exits 0ing — `cd packages/plugin-canvas && pnpm test` green
- [ ] Zero type errors — `pnpm typecheck` exits 0 — `pnpm typecheck`
- [ ] Zero lint warnings — `pnpm lint` exits 0 — `pnpm lint`

---

### T1.3 — Redact API keys from CopilotRuntime agent config

#### Objective
Prevent API keys from being serialized into broadcast payloads or error handlers by accepting a thunk instead of a raw string.

#### Why this step (action + reasoning — ReAct discipline)

This step changes the agent config to accept `apiKey` as `() => string` (lazy thunk) instead of a plain string, ensuring the key is resolved only at the point of use (the SDK call) and never appears in serialized state or error payloads.

Finding #134 identifies that `runtime.ts:228` spreads `apiKey` into the agent call payload. If the agent SDK logs the request or if an error serializes the config, the key leaks. Lazy resolution (thunk pattern) is the canonical defense — the key never exists as a property on a long-lived object.

#### Evidence
- `runtime.ts:228` — `apiKey: reg.descriptor.agent.apiKey` spread into streamObject call.
- Finding #134 — severity high, category security.

#### Files to edit
```
packages/plugin-copilot/src/internal/runtime.ts — change apiKey to thunk; resolve at call site
packages/plugin-copilot/src/types.ts — update CopilotAgentDescriptor type (apiKey: string | (() => string))
packages/plugin-copilot/tests/runtime.test.ts — add API key non-leakage test
```

#### Deep file dependency analysis
- **runtime.ts** (299 LoC) — `CopilotRuntime` class. The `apiKey` is read from `reg.descriptor.agent.apiKey` at line 228. Change to `resolveApiKey(reg.descriptor.agent)` helper.
- **types.ts** — `CopilotAgentDescriptor` type defines `apiKey: string`. Change to `apiKey: string | (() => string)`.
- **runtime.test.ts** (271 LoC) — add assertion that broadcast payloads do not contain `apiKey`.

#### Deep Dives
- **Thunk resolution:** `const key = typeof agent.apiKey === 'function' ? agent.apiKey() : agent.apiKey;` — backward compatible.
- **Invariant:** `CopilotRuntime` public API unchanged. Internal `resolveApiKey()` is private.
- **Edge case:** If thunk throws, error propagates to caller (fail-fast, Rule 8).

#### Tasks
1. Update `CopilotAgentDescriptor.apiKey` type to `string | (() => string)`.
2. Add `resolveApiKey()` private helper in runtime.ts.
3. Replace direct `apiKey` spread with `resolveApiKey()` call.
4. Add test asserting API key absence in broadcast payloads.

#### TDD
```
RED:     test_broadcast_payload_does_not_contain_api_key() — asserts apiKey not in any broadcast frame
RED:     test_api_key_thunk_resolved_at_call_time() — asserts thunk called exactly once per invocation
GREEN:   Implement resolveApiKey helper + type change
REFACTOR: None expected
VERIFY:  cd packages/plugin-copilot && pnpm test
```

#### Concurrency tests

(none — single-threaded)

#### Acceptance Criteria
- [ ] `apiKey` never appears in broadcast payloads (test assertion)
- [ ] Both `string` and `() => string` accepted for apiKey
- [ ] All existing runtime tests pass — `cd packages/plugin-copilot && pnpm test` exits 0
- [ ] Pass: lint — `pnpm lint` returns exit code 0 with 0 warnings
- [ ] Pass: size — `wc -l packages/plugin-copilot/src/internal/runtime.ts` ≤ 500

#### DoD (Definition of Done)
- [ ] All tests pass — `pnpm test` exits 0ing — `cd packages/plugin-copilot && pnpm test` green
- [ ] Zero type errors — `pnpm typecheck` exits 0 — `pnpm typecheck`
- [ ] Zero lint warnings — `pnpm lint` exits 0 — `pnpm lint`

---

### T1.4 — Sanitize error messages in HTTP responses

#### Objective
Return generic error messages in 500 responses instead of leaking internal error details.

#### Why this step (action + reasoning — ReAct discipline)

This step replaces `err.message` in `errorToResponse()` with a generic "Internal Server Error" for 500 status codes. Specific error details are logged server-side but never sent to the client.

Finding #146 identifies that `route-handlers.ts:183` exposes raw `err.message` to HTTP clients, potentially leaking database schema, file paths, or internal state. Per OWASP A09 (Security Logging and Monitoring), error details belong in server logs, not client responses.

#### Evidence
- `route-handlers.ts:183` — `err.message` returned in HTTP 500 body.
- Finding #146 — severity medium, category security.

#### Files to edit
```
packages/plugin-canvas/src/route-handlers.ts — sanitize 500 error responses
```

#### Deep file dependency analysis
- **route-handlers.ts** (185 LoC) — `errorToResponse(err)` at line 183 returns `err.message`. Change to return generic message for 500; keep specific messages for 4xx (validation errors are user-facing).

#### Deep Dives
- **4xx vs 5xx distinction:** 400/404/409 errors have user-facing messages (e.g., "artifact not found"). Only 500 gets generic message.
- **Logging:** Add `console.error` with full error + stack before returning generic response.

#### Tasks
1. Modify `errorToResponse()` to return generic message for status >= 500.
2. Add server-side error logging with context.

#### TDD
```
RED:     test_500_error_does_not_leak_internal_message() — expects body "Internal Server Error", not the actual error
GREEN:   Modify errorToResponse to sanitize 500s
REFACTOR: None expected
VERIFY:  cd packages/plugin-canvas && pnpm test
```

#### Concurrency tests

(none — single-threaded)

#### Acceptance Criteria
- [ ] 500 responses return "Internal Server Error" (never raw err.message)
- [ ] 4xx responses retain specific messages — `test_400_returns_validation_message` asserts body contains `"invalid"` substring
- [ ] Server-side logging captures full error context — `console.error` spy contains `error.message` and `error.stack`
- [ ] Pass: lint — `pnpm lint` returns exit code 0 with 0 warnings

#### DoD (Definition of Done)
- [ ] All tests pass — `pnpm test` exits 0ing — `cd packages/plugin-canvas && pnpm test` green
- [ ] Zero type errors — `pnpm typecheck` exits 0 — `pnpm typecheck`

---

### T1.5 — Add sandbox attribute to devtools iframe

#### Objective
Add `sandbox` attribute to the Drizzle Studio devtools iframe to restrict its capabilities.

#### Why this step (action + reasoning — ReAct discipline)

This step adds `iframe.sandbox = "allow-scripts allow-same-origin"` to the iframe created in `buildDevtoolsTab()`. Without sandbox, the iframe has full access to the parent document and local network.

Finding #150 identifies the missing sandbox attribute. This is a 1-line fix with no behavioral change for legitimate use.

#### Evidence
- `devtools.ts:42` — iframe created without sandbox attribute.
- Finding #150 — severity medium, category security.

#### Files to edit
```
packages/plugin-db-drizzle/src/devtools.ts — add sandbox attribute
```

#### Deep file dependency analysis
- **devtools.ts** (52 LoC) — `mount()` creates iframe at line 44. Add `iframe.sandbox.add('allow-scripts', 'allow-same-origin')` after src assignment.

#### Tasks
1. Add `sandbox` attribute after `iframe.src = studioUrl` assignment.

#### TDD
```
RED:     test_devtools_iframe_has_sandbox_attribute() — asserts sandbox property is set
GREEN:   Add iframe.sandbox line
REFACTOR: None expected
VERIFY:  cd packages/plugin-db-drizzle && pnpm test
```

#### Concurrency tests

(none — single-threaded)

#### Acceptance Criteria
- [ ] Iframe element has `sandbox="allow-scripts allow-same-origin"` attribute
- [ ] Drizzle Studio still functions — `cd packages/plugin-db-drizzle && pnpm test` exits 0 with iframe `sandbox` attribute containing `allow-scripts`
- [ ] Pass: lint — `pnpm lint` returns exit code 0 with 0 warnings

#### DoD (Definition of Done)
- [ ] All tests pass — `pnpm test` exits 0ing — `cd packages/plugin-db-drizzle && pnpm test` green
- [ ] Zero type errors — `pnpm typecheck` exits 0 — `pnpm typecheck`

---

## Phase 2: Correctness Fixes

**Objective:** Fix all 4 concurrency and 4 contract findings.

### T2.1 — Serialize CopilotRuntime.handleFrame with per-registration queue

#### Objective
Prevent concurrent `handleFrame` calls from racing on budget and agent invocation.

#### Why this step (action + reasoning — ReAct discipline)

This step adds a per-registration Promise chain (serial queue) to `handleFrame()`, ensuring that concurrent triggers for the same registration are serialized. Budget is charged atomically before the agent call.

Finding #132 identifies that concurrent `handleFrame` calls race on budget checks and agent invocations. Without serialization, two concurrent frames can both pass the budget check, leading to overspend. Per D2 rationale, a simple Promise chain is the minimal solution (KISS over mutex).

#### Evidence
- `runtime.ts:178` — `handleFrame` is async but has no serialization.
- Finding #132 — severity high, category concurrency.

#### Files to edit
```
packages/plugin-copilot/src/internal/runtime.ts — add per-registration Promise chain
packages/plugin-copilot/tests/runtime.test.ts — add concurrency test
```

#### Deep file dependency analysis
- **runtime.ts** (299 LoC) — `handleFrame(registrationId, frame)` at line 178. Add `private queues = new Map<string, Promise<void>>()` and chain each call.

#### Deep Dives
- **Queue pattern:** `this.queues.set(id, (this.queues.get(id) ?? Promise.resolve()).then(() => this._handleFrame(id, frame)).catch(() => {}))`. The catch prevents queue poisoning from a single failure.
- **Invariant:** Public API unchanged. Internal `_handleFrame` is the extracted body.
- **Budget atomicity:** Budget check + charge happens inside `_handleFrame` while holding the queue slot.
- **Deactivate must drain the queue (EC-3 MUST FIX):** Current `deactivate()` at line 151 immediately calls `reg.unsubscribeRoom()` and `reg.member.leave()` without awaiting pending queue items. In-flight `runAgent` promises continue executing after `leave()` — broadcasting to a room the member already left. Fix: `await this.queues.get(copilotId)` in `deactivate()` before calling `reg.member.leave()`. This drains pending work before teardown. After drain, delete the queue entry to release memory.

#### Tasks
1. Add `private queues: Map<string, Promise<void>>` field.
2. Rename current `handleFrame` body to `_handleFrame`.
3. New `handleFrame` enqueues via Promise chain.
4. **Update `deactivate()` to drain the queue before `leave()` (EC-3).** Add `await this.queues.get(copilotId)` before `reg.member.leave()`. Then `this.queues.delete(copilotId)`.
5. Add concurrency test.
6. Add deactivate-drain test.

#### TDD
```
RED:     test_concurrent_handleFrame_serialized() — sends 5 concurrent frames; asserts budget charged exactly 5 times (not more, not less)
RED:     test_deactivate_drains_pending_queue() — enqueue 2 frames then immediately deactivate; asserts both frames complete before leave() is called (EC-3)
RED:     test_deactivate_with_empty_queue_resolves_immediately() — deactivate on idle registration completes without hanging
GREEN:   Implement Promise chain queue + deactivate drain
REFACTOR: Extract _handleFrame
VERIFY:  cd packages/plugin-copilot && pnpm test
```

#### Concurrency tests

Happens-before observation: concurrent test with Promise.all([handleFrame(id, f1), ..., handleFrame(id, f5)])
  → assert budget.charged === 5 (no lost update, no double-charge via atomic counter invariant)
  → assert agent.invocations === 5 (sequential, not parallel)

Deactivate drain (EC-3):
  enqueue frame → immediately call deactivate()
  → assert frame handler completed BEFORE leave() was called
  → assert queue entry deleted after drain
```

#### Acceptance Criteria
- [ ] 5 concurrent handleFrame calls result in exactly 5 sequential agent invocations — `test_concurrent_handleFrame_serialized` asserts `agent.invocations === 5`
- [ ] Budget is never bypassed under concurrency — `test_concurrent_handleFrame_serialized` asserts `budget.charged === 5`
- [ ] `deactivate()` awaits pending queue before `leave()` (EC-3)
- [ ] `deactivate()` on idle registration resolves in < 50ms — `test_deactivate_with_empty_queue` asserts resolution time
- [ ] Queue entry deleted after deactivate — `this.queues.has(copilotId)` returns `false` post-deactivate
- [ ] All existing runtime tests pass — `cd packages/plugin-copilot && pnpm test` exits 0
- [ ] Pass: lint — `pnpm lint` returns exit code 0 with 0 warnings

#### DoD (Definition of Done)
- [ ] All tests pass — `pnpm test` exits 0ing — `cd packages/plugin-copilot && pnpm test` green
- [ ] Zero type errors — `pnpm typecheck` exits 0 — `pnpm typecheck`

---

### T2.2 — Apply single-flight to mermaid and Yjs lazy loaders

#### Objective
Ensure concurrent calls to `loadMermaid()` and `loadYjs()` share a single import Promise and errors are not permanently cached.

#### Why this step (action + reasoning — ReAct discipline)

This step replaces the `let instance | null` + `let error = false` pattern with a Promise-caching single-flight in both lazy loaders. The first caller creates the import Promise; subsequent concurrent callers await the same Promise. On error, the cached Promise is cleared so the next caller retries.

Findings #130 and #131 identify race conditions where concurrent calls must double-initialize or permanently cache errors. Per D2, single-flight is the canonical solution.

#### Evidence
- `mermaid-artifact.tsx:14` — module-level `mermaidInstance` + `mermaidLoadError` flags.
- `yjs-provider.ts:69` — module-level `cachedYjs` + `cachedAwareness`.
- Findings #130, #131 — severity medium, category concurrency.

#### Files to edit
```
packages/plugin-canvas/src/ui/renderers/mermaid-artifact.tsx — single-flight loadMermaid
packages/plugin-realtime/src/yjs-provider.ts — single-flight loadYjs
```

#### Deep file dependency analysis
- **mermaid-artifact.tsx** (92 LoC) — lines 11-36: lazy loader. Replace with `let pending: Promise<MermaidApi> | null = null`.
- **yjs-provider.ts** (272 LoC) — lines 66-94: lazy loader. Replace with `let pending: Promise<YjsModule> | null = null`.

#### Deep Dives
- **Pattern:**
  ```ts
  let pending: Promise<T> | null = null;
  function loadX(): Promise<T> {
    if (!pending) {
      pending = import('x').then(mod => mod.default).catch(err => { pending = null; throw err; });
    }
    return pending;
  }
  ```
- **Error retry:** `catch` clears `pending`, so next caller retries. No permanent error cache.

#### Tasks
1. Rewrite `loadMermaid()` with single-flight pattern.
2. Rewrite `loadYjs()` with single-flight pattern.
3. Verify renderers still work with existing tests.

#### TDD
```
RED:     test_concurrent_loadMermaid_calls_import_once() — calls loadMermaid() 3x concurrently; asserts import called once
RED:     test_loadMermaid_retries_after_error() — first call errors; second call retries successfully
GREEN:   Implement single-flight in both files
REFACTOR: Remove error flag variables
VERIFY:  cd packages/plugin-canvas && pnpm test && cd ../plugin-realtime && pnpm test
```

#### Concurrency tests

Happens-before observation: concurrent test with Promise.all([loadMermaid(), loadMermaid(), loadMermaid()])
  → assert dynamic import called exactly 1 time (atomic counter invariant on import count)
  → assert all 3 Promises resolve to the same instance

#### Acceptance Criteria
- [ ] Concurrent calls share a single import — `test_concurrent_loadMermaid_calls_import_once` asserts `import.callCount === 1`
- [ ] Failed imports do not permanently disable the loader — `test_loadMermaid_retries_after_error` asserts second call succeeds after first failure
- [ ] All existing mermaid/Yjs tests pass — `cd packages/plugin-canvas && pnpm test` and `cd packages/plugin-realtime && pnpm test` exit 0
- [ ] Pass: lint — `pnpm lint` returns exit code 0 with 0 warnings

#### DoD (Definition of Done)
- [ ] All tests pass — `pnpm test` exits 0ing — canvas + realtime packages green
- [ ] Zero type errors — `pnpm typecheck` exits 0 — `pnpm typecheck`

---

### T2.3 — Fix BudgetBridge month calculation

#### Objective
Replace the fixed 30-day window with UTC calendar month boundaries.

#### Why this step (action + reasoning — ReAct discipline)

This step replaces the `30 * 86_400_000` millisecond check with a proper UTC month-boundary calculation. The current implementation resets budget based on a fixed 30-day window, which is incorrect for February (28/29 days) and 31-day months.

Finding #135 identifies this as a contract violation — the budget bridge promises monthly reset but delivers 30-day reset.

#### Evidence
- `budget-bridge.ts:54` — `if (now >= s.monthStartMs + 30 * 86_400_000)`.
- Finding #135 — severity medium, category contract.

#### Files to edit
```
packages/plugin-copilot/src/internal/budget-bridge.ts — use calendar month boundaries
packages/plugin-copilot/tests/budget-bridge.test.ts (NEW) — month boundary tests
```

#### Deep file dependency analysis
- **budget-bridge.ts** (118 LoC) — `BudgetBridge` class. Line 54 is the month reset check. Replace with `startOfNextMonth(s.monthStartMs)` comparison.

#### Deep Dives
- **Calendar month logic:**
  ```ts
  function startOfNextMonth(ms: number): number {
    const d = new Date(ms);
    d.setUTCMonth(d.getUTCMonth() + 1, 1);
    d.setUTCHours(0, 0, 0, 0);
    return d.getTime();
  }
  ```
- **Edge cases:** Dec 31 → Jan 1 rollover, Feb 28 → Mar 1, leap year Feb 29.

#### Tasks
1. Add `startOfNextMonth()` helper function.
2. Replace `30 * 86_400_000` check with `startOfNextMonth()`.
3. Write month boundary regression tests.

#### TDD
```
RED:     test_budget_resets_on_calendar_month_boundary() — Feb 1 → Mar 1 (28 days, not 30)
RED:     test_budget_does_not_reset_mid_month() — Feb 15 → Feb 28 (no reset)
RED:     test_budget_resets_on_december_to_january() — Dec 31 → Jan 1
GREEN:   Implement startOfNextMonth + replace check
REFACTOR: None expected
VERIFY:  cd packages/plugin-copilot && pnpm test
```

#### Concurrency tests

(none — single-threaded)

#### Acceptance Criteria
- [ ] Budget resets at UTC month boundary — `test_budget_resets_on_calendar_month_boundary` asserts reset on Feb 28→Mar 1
- [ ] February (28 days) triggers reset correctly — `test_budget_resets_on_calendar_month_boundary` asserts `monthlyUsedUsd === 0` after Feb→Mar
- [ ] All existing copilot tests pass — `cd packages/plugin-copilot && pnpm test` exits 0
- [ ] Pass: lint — `pnpm lint` returns exit code 0 with 0 warnings

#### DoD (Definition of Done)
- [ ] All tests pass — `pnpm test` exits 0ing — `cd packages/plugin-copilot && pnpm test` green
- [ ] Zero type errors — `pnpm typecheck` exits 0 — `pnpm typecheck`

---

### T2.4 — Validate ArtifactKind in route-handlers parseListFilter

#### Objective
Validate the `kind` query parameter against the `ARTIFACT_KINDS` enum instead of unchecked type assertion.

#### Why this step (action + reasoning — ReAct discipline)

This step adds runtime validation of the `kind` query string parameter in `parseListFilter()`, rejecting invalid values with a 400 response instead of silently casting to `ArtifactKind`.

Finding #138 identifies that `route-handlers.ts:70` casts an arbitrary string to `ArtifactKind` without validation. A consumer sending `?kind=invalid` bypasses type safety.

#### Evidence
- `route-handlers.ts:70` — unchecked `as ArtifactKind` assertion.
- Finding #138 — severity medium, category contract.

#### Files to edit
```
packages/plugin-canvas/src/route-handlers.ts — validate kind against ARTIFACT_KINDS
```

#### Tasks
1. Import `ARTIFACT_KINDS` (or extract the set from the Zod schema).
2. Validate `kind` parameter; return 400 for invalid values.

#### TDD
```
RED:     test_list_filter_rejects_invalid_kind() — expects 400 for ?kind=invalid
RED:     test_list_filter_accepts_valid_kind() — expects 200 for ?kind=markdown
GREEN:   Add validation check
REFACTOR: None expected
VERIFY:  cd packages/plugin-canvas && pnpm test
```

#### Concurrency tests

(none — single-threaded)

#### Acceptance Criteria
- [ ] Invalid `kind` values return 400 — `test_list_filter_rejects_invalid_kind` asserts response status `=== 400`
- [ ] Valid `kind` values pass through — `test_list_filter_accepts_valid_kind` asserts response status `=== 200`
- [ ] Pass: lint — `pnpm lint` returns exit code 0 with 0 warnings

#### DoD (Definition of Done)
- [ ] All tests pass — `pnpm test` exits 0ing — `cd packages/plugin-canvas && pnpm test` green
- [ ] Zero type errors — `pnpm typecheck` exits 0 — `pnpm typecheck`

---

## Phase 3: Error Handling Fixes

**Objective:** Fix all 6 error handling findings — swallowed errors across 5 packages.

### T3.1 — Log onAfterInsert errors in route-handlers

#### Objective
Replace the empty catch block in `route-handlers.ts:128` with structured error logging.

#### Why this step
Finding #133 — swallowed side-effect errors. The empty `catch {}` hides failures in SSE fan-out, audit logging, and other post-insert side effects. Add `console.error` with request context.

#### Files to edit
```
packages/plugin-canvas/src/route-handlers.ts — add error logging in onAfterInsert catch
```

#### TDD
```
RED:     test_onAfterInsert_error_is_logged() — mock console.error; trigger error in onAfterInsert; assert logged
GREEN:   Replace catch {} with catch (err) { console.error(...) }
VERIFY:  cd packages/plugin-canvas && pnpm test
```

#### Concurrency tests

(none — single-threaded)

#### Acceptance Criteria
- [ ] onAfterInsert errors logged with context — `console.error` spy called with object containing `artifactId` and `error.message`
- [ ] Side-effect failure does not crash the request — `test_onAfterInsert_error_is_logged` asserts response status `!== 500`
- [ ] Pass: lint — `pnpm lint` returns exit code 0 with 0 warnings

#### DoD
- [ ] All tests pass — `pnpm test` exits 0ing
- [ ] Zero type errors — `pnpm typecheck` exits 0

---

### T3.2 — Log listener errors in MemoryRealtimeProvider and YjsRealtimeProvider

#### Objective
Add error logging to the empty `catch {}` in listener fanout loops.

#### Why this step
Finding #137 — listener errors silently swallowed in both providers. Add `console.error` per listener with the event type and listener identity.

#### Files to edit
```
packages/plugin-realtime/src/memory-provider.ts — add error logging in listener catch
packages/plugin-realtime/src/yjs-provider.ts — add error logging in listener catch
```

#### TDD
```
RED:     test_listener_error_is_logged_not_swallowed() — register throwing listener; assert console.error called; assert other listeners still run
GREEN:   Replace catch {} with catch (err) { console.error(...) }
VERIFY:  cd packages/plugin-realtime && pnpm test
```

#### Concurrency tests

(none — single-threaded)

#### Acceptance Criteria
- [ ] Listener errors are logged — `console.error` spy called with the thrown error when listener throws
- [ ] One failing listener does not prevent others from running — `test_listener_error_is_logged` asserts all 3 listeners called when first throws
- [ ] Pass: lint — `pnpm lint` returns exit code 0 with 0 warnings

#### DoD
- [ ] All tests pass — `pnpm test` exits 0ing — `cd packages/plugin-realtime && pnpm test` green

---

### T3.3 — Propagate agent errors in CopilotRuntime.runAgent

#### Objective
Surface agent invocation errors to the caller instead of swallowing them in catch.

#### Why this step
Finding #142 — `runAgent` catches agent errors, broadcasts a failure frame, but does not propagate the error. Callers cannot distinguish success from failure. Rethrow after broadcast.

#### Files to edit
```
packages/plugin-copilot/src/internal/runtime.ts — rethrow after error broadcast
```

#### TDD
```
RED:     test_runAgent_propagates_agent_error() — mock failing agent; assert error is thrown to caller after broadcast
GREEN:   Add throw after broadcast in catch block
VERIFY:  cd packages/plugin-copilot && pnpm test
```

#### Concurrency tests

(none — single-threaded)

#### Acceptance Criteria
- [ ] Agent errors are broadcast AND thrown — `test_runAgent_propagates_agent_error` asserts `broadcastMessage` called AND `rejects.toThrow`
- [ ] Callers see the error — `expect(handleFrame(...)).rejects.toThrow()` passes
- [ ] Pass: lint — `pnpm lint` returns exit code 0 with 0 warnings

#### DoD
- [ ] All tests pass — `pnpm test` exits 0ing — `cd packages/plugin-copilot && pnpm test` green

---

### T3.4 — Rethrow non-ActionInputError in TheoForm handleValid

#### Objective
Distinguish action errors from callback errors in TheoForm's error handling.

#### Why this step
Finding #155 — `TheoForm` catches all errors from `onSuccess` callback and maps them as action errors. Non-`ActionInputError` exceptions must be rethrown to preserve the original error semantics.

#### Files to edit
```
packages/plugin-forms/src/components/TheoForm.tsx — rethrow non-ActionInputError
```

#### TDD
```
RED:     test_non_action_error_in_onSuccess_is_rethrown() — expects non-ActionInputError to propagate
GREEN:   Add instanceof check in catch; rethrow if not ActionInputError
VERIFY:  cd packages/plugin-forms && pnpm test
```

#### Concurrency tests

(none — single-threaded)

#### Acceptance Criteria
- [ ] ActionInputError still handled gracefully — `test_action_input_error_mapped_to_form` asserts `context.error` contains field errors
- [ ] Other errors rethrown — `test_non_action_error_in_onSuccess_is_rethrown` asserts `rejects.toThrow(TypeError)`
- [ ] Pass: lint — `pnpm lint` returns exit code 0 with 0 warnings

#### DoD
- [ ] All tests pass — `pnpm test` exits 0ing — `cd packages/plugin-forms && pnpm test` green

---

### T3.5 — Fix WebhookRegistry dispatch to log errors and continue (EC-2 revised)

#### Objective
Run all handlers even if one throws, but preserve the existing error contract (throw the first error, not AggregateError).

#### Why this step (action + reasoning — ReAct discipline)

Finding #147 — `WebhookRegistry.dispatch` stops on first handler failure. Remaining handlers never run.

**EC-2 revision:** The original plan proposed changing to `AggregateError`. Edge case analysis revealed this is a **breaking change**: existing tests assert `.rejects.toThrow("user handler failed")` (single Error), and consumer code (`processWebhook()`) catches a single `Error` and inspects it via `instanceof`. Changing to `AggregateError` breaks both the test suite and consumer contracts.

**Revised approach:** Wrap each handler in try-catch. Log errors for non-first failures. After all handlers have run, throw the **first** error (preserving the current contract). Later handler errors are logged with `console.error` but do not alter the thrown error shape. This ensures all handlers execute while maintaining backward compatibility.

#### Files to edit
```
packages/plugin-payments/src/webhook.ts — wrap handlers in try-catch; log subsequent errors; throw first
packages/plugin-payments/tests/webhook.test.ts — add multi-handler error test
```

#### Deep Dives
- **Backward compat (EC-2):** `dispatch()` still throws a single `Error` — callers doing `catch (err) { if (err instanceof SpecificError) }` continue working. Only change: subsequent handlers now execute instead of being skipped.
- **Error logging:** Non-first errors logged as `console.error('WebhookRegistry: handler failed after primary error', { eventType, error })`. This provides observability without changing the contract.
- **Test impact:** Existing test `"handler throwing propagates the error to the dispatcher caller"` continues passing because the first error is still thrown.

#### TDD
```
RED:     test_dispatch_runs_all_handlers_even_if_one_throws() — register 3 handlers; first throws; assert all 3 called
RED:     test_dispatch_throws_first_error_not_aggregate() — register 2 throwing handlers; assert thrown error is from the first (LIFO) handler, not AggregateError (EC-2)
RED:     test_dispatch_logs_subsequent_handler_errors() — mock console.error; assert subsequent errors logged
GREEN:   Add per-handler try-catch; collect errors; throw first; log rest
VERIFY:  cd packages/plugin-payments && pnpm test
```

#### Concurrency tests

(none — single-threaded)

#### Acceptance Criteria
- [ ] All handlers run regardless of individual failures — `test_dispatch_runs_all_handlers` asserts all 3 handler spies called === 1
- [ ] First handler error is thrown (NOT AggregateError — EC-2)
- [ ] Subsequent handler errors logged via `console.error` — spy asserts `callCount >= 1` for non-first errors
- [ ] LIFO execution order preserved — handler registered last called first (index assertion in test)
- [ ] Existing test `"handler throwing propagates the error"` passes unchanged — `cd packages/plugin-payments && pnpm test` exits 0
- [ ] Pass: lint — `pnpm lint` returns exit code 0 with 0 warnings

#### DoD
- [ ] All tests pass — `pnpm test` exits 0ing — `cd packages/plugin-payments && pnpm test` green

---

### T3.6 — Preserve error context in ResendProvider.send

#### Objective
Wrap and rethrow Resend API errors with context instead of swallowing partial error information.

#### Why this step
Finding #139 — `ResendProvider.send` catches Resend API errors but discards the original error context. Wrap in a typed error that preserves the cause chain.

#### Files to edit
```
packages/plugin-email/src/resend-provider.ts — preserve error cause
packages/plugin-email/tests/resend-provider.test.ts (NEW) — basic send error test
```

#### TDD
```
RED:     test_send_error_preserves_resend_api_context() — mock Resend failing; assert error.cause contains original
RED:     test_send_success_returns_message_id() — mock Resend success; assert result
GREEN:   Use new Error('...', { cause: originalError }) pattern
VERIFY:  cd packages/plugin-email && pnpm test
```

#### Concurrency tests

(none — single-threaded)

#### Acceptance Criteria
- [ ] Error cause chain preserved — `test_send_error_preserves_resend_api_context` asserts `error.cause` is the original Resend error
- [ ] New test file exists at `packages/plugin-email/tests/resend-provider.test.ts` with ≥ 2 test cases
- [ ] Pass: lint — `pnpm lint` returns exit code 0 with 0 warnings

#### DoD
- [ ] All tests pass — `pnpm test` exits 0ing — `cd packages/plugin-email && pnpm test` green

---

## Phase 4: Test Coverage

**Objective:** Add regression tests for all security-critical findings and close the test gaps identified in Phase 4 of the review.

### T4.1 — Add SQLite adapter test suite

#### Objective
Create tests that exercise the SQLite adapter path, including SQL injection regression tests.

#### Why this step
Finding #156 — SQLite adapter has zero test coverage. The SQL injection fix from T1.1 needs regression tests against the actual SQLite adapter, not just the constructor validation.

#### Files to edit
```
packages/plugin-canvas/tests/store.test.ts — add SQLite adapter test section
```

#### TDD
```
RED:     test_sqlite_adapter_insert_and_get() — basic CRUD via SQLite adapter
RED:     test_sqlite_adapter_list_with_filter() — list with kind filter
RED:     test_sqlite_adapter_delete() — delete and verify removed
RED:     test_sqlite_adapter_rejects_injection_in_content() — content with SQL characters stored safely (parameterized)
GREEN:   Tests should pass against the fixed store.ts from T1.1
VERIFY:  cd packages/plugin-canvas && pnpm test
```

#### Concurrency tests

(none — single-threaded)

#### Acceptance Criteria
- [ ] SQLite adapter has ≥ 4 test cases covering CRUD
- [ ] SQL injection regression test exists — `test_sqlite_store_rejects_table_name_with_sql_injection` in `store.test.ts`
- [ ] Pass: all tests green — `cd packages/plugin-canvas && pnpm test` exits 0

#### DoD
- [ ] All tests pass — `pnpm test` exits 0ing — `cd packages/plugin-canvas && pnpm test` green

---

### T4.2 — Add SVG sanitizer bypass vector tests

#### Objective
Add regression tests for the specific XSS bypass vectors that the old regex sanitizer missed.

#### Why this step
Finding #157 — existing tests cover 7 basic vectors but miss known regex bypass classes. These tests serve as the regression gate for the DOMPurify migration (T1.2).

#### Files to edit
```
packages/plugin-canvas/tests/sanitize.test.ts — add bypass vector test section
```

#### TDD
```
RED:     (already covered by T1.2 TDD — these tests are the same)
GREEN:   DOMPurify migration from T1.2 makes them pass
VERIFY:  cd packages/plugin-canvas && pnpm test
```

*Note: This task is logically part of T1.2 but listed separately for coverage matrix traceability.*

#### Acceptance Criteria
- [ ] ≥ 6 bypass vector tests exist
- [ ] All pass with DOMPurify

#### DoD
- [ ] All tests pass — `pnpm test` exits 0ing

---

### T4.3 — Add API key non-leakage tests

#### Objective
Assert that API keys never appear in broadcast payloads or error messages.

#### Why this step
Finding #159 — no test verifies API key redaction. This is the regression gate for T1.3.

#### Files to edit
```
packages/plugin-copilot/tests/runtime.test.ts — add key leakage assertion
```

#### TDD
```
RED:     (already covered by T1.3 TDD)
GREEN:   T1.3 implementation makes them pass
VERIFY:  cd packages/plugin-copilot && pnpm test
```

*Note: Logically part of T1.3 but listed separately for coverage matrix traceability.*

#### Acceptance Criteria
- [ ] Broadcast payload deep-searched for API key pattern
- [ ] Test passes

#### DoD
- [ ] All tests pass — `pnpm test` exits 0ing

---

## Phase 5: Complexity Reduction (Top 3)

**Objective:** Reduce the top-3 cyclomatic complexity hotspots from CC>95 to CC<25 per function via extract-function refactoring.

### T5.1 — Decompose canvas reducer (CC=158)

#### Objective
Extract per-action-type handler functions from the monolithic `reducer` in `use-canvas.ts`.

#### Why this step (action + reasoning — ReAct discipline)

This step extracts each `case` arm of the reducer's switch statement into a named handler function (e.g., `handleAddArtifact`, `handleUpdateArtifact`, `handleSelectArtifact`). The reducer becomes a thin dispatcher.

Per D4, CC=158 is 15x the McCabe threshold and classified "untestable". Extract-function is the lowest-risk refactoring — no behavior change, only structural decomposition. The existing test suite validates behavioral equivalence.

#### Evidence
- `use-canvas.ts:53` — reducer function with CC=158.
- lizard measurement: confirmed by tool.

#### Files to edit
```
packages/plugin-canvas/src/ui/use-canvas.ts — extract per-action handlers
packages/plugin-canvas/src/ui/canvas-reducer-handlers.ts (NEW) — extracted handler functions
```

#### Deep file dependency analysis
- **use-canvas.ts** (325 LoC) — the `reducer` function at line 53 handles all canvas action types in a single switch/case. Extract each case body into `canvas-reducer-handlers.ts`.
- Callers: `useCanvas()` hook in the same file uses `useReducer(reducer, ...)`.

#### Tasks
1. Create `canvas-reducer-handlers.ts` with one exported function per action type.
2. Refactor `reducer` to dispatch to handlers.
3. Verify all existing canvas tests pass (behavioral equivalence).

#### TDD
```
RED:     (no new tests — this is a refactor; existing tests are the safety net)
GREEN:   Extract handlers; reducer dispatches
REFACTOR: Ensure each handler function has CC < 10
VERIFY:  cd packages/plugin-canvas && pnpm test
```

#### Concurrency tests

(none — single-threaded)

#### Acceptance Criteria
- [ ] `reducer` function CC < 25 (dispatcher only)
- [ ] Each extracted handler CC < 10
- [ ] All existing canvas tests pass unchanged — `cd packages/plugin-canvas && pnpm test` exits 0
- [ ] Pass: size — `wc -l` on each new/modified file returns ≤ 500

#### DoD
- [ ] All tests pass — `pnpm test` exits 0ing
- [ ] Zero type errors — `pnpm typecheck` exits 0

---

### T5.2 — Decompose CanvasPanel (CC=115)

#### Objective
Extract sub-components from the monolithic `CanvasPanel` component.

#### Why this step
Per D4, CC=115 is 11x the threshold. The component mixes keyboard handling, layout logic, and per-artifact-kind rendering. Extract into sub-components: `CanvasToolbar`, `CanvasArtifactList`, `CanvasKeyboardHandler`.

#### Files to edit
```
packages/plugin-canvas/src/ui/canvas-panel.tsx — slim down to composition root
packages/plugin-canvas/src/ui/canvas-toolbar.tsx (NEW) — toolbar sub-component
packages/plugin-canvas/src/ui/canvas-artifact-list.tsx (NEW) — artifact list sub-component
```

#### Tasks
1. Extract toolbar into `canvas-toolbar.tsx`.
2. Extract artifact list rendering into `canvas-artifact-list.tsx`.
3. CanvasPanel becomes composition root importing sub-components.
4. Verify all existing tests pass.

#### TDD
```
RED:     (refactor — existing tests validate)
GREEN:   Extract sub-components
REFACTOR: Each sub-component CC < 10
VERIFY:  cd packages/plugin-canvas && pnpm test
```

#### Concurrency tests

(none — single-threaded)

#### Acceptance Criteria
- [ ] `CanvasPanel` CC < 25
- [ ] Each sub-component CC < 10
- [ ] All existing tests pass unchanged — `pnpm test` exits 0
- [ ] Pass: size — `wc -l` on each new/modified file returns ≤ 500

#### DoD
- [ ] All tests pass — `pnpm test` exits 0ing
- [ ] Zero type errors — `pnpm typecheck` exits 0

---

### T5.3 — Decompose createSqliteArtifactStore (CC=97)

#### Objective
Extract per-query methods from the monolithic factory function.

#### Why this step
Per D4, CC=97. The function inlines all CRUD query logic in a single body. Extract `insertArtifact()`, `getArtifact()`, `listArtifacts()`, `deleteArtifact()`, `updateArtifact()` as named closures or a class.

#### Files to edit
```
packages/plugin-canvas/src/store.ts — extract per-query methods
```

#### Tasks
1. Extract each CRUD operation into a named function.
2. The factory returns an object composing these functions.
3. Verify all existing + new SQLite tests pass.

#### TDD
```
RED:     (refactor — T4.1 SQLite tests + existing tests validate)
GREEN:   Extract per-query methods
REFACTOR: Each method CC < 10
VERIFY:  cd packages/plugin-canvas && pnpm test
```

#### Concurrency tests

(none — single-threaded)

#### Acceptance Criteria
- [ ] `createSqliteArtifactStore` outer function CC < 15
- [ ] Each extracted method CC < 10
- [ ] All tests pass — `pnpm test` exits 0
- [ ] Pass: size — `wc -l packages/plugin-canvas/src/store.ts` returns ≤ 500

#### DoD
- [ ] All tests pass — `pnpm test` exits 0ing
- [ ] Zero type errors — `pnpm typecheck` exits 0

---

## Phase 6: Documentation

**Objective:** Update stale documentation in plugin-voice and plugin-realtime.

### T6.1 — Update plugin-voice README

#### Objective
Remove the automatic endpoint registration claim and update the status line.

#### Why this step
Finding #2 (HIGH) — README claims automatic endpoint registration but `register()` is empty. Finding #3 (MEDIUM) — status line says 0.1.0 scaffold but codebase has full STT/TTS.

#### Files to edit
```
packages/plugin-voice/README.md — update status, remove false claim, document defineRoute pattern
```

#### Tasks
1. Update status line from "0.1.0 scaffold" to current version with feature list.
2. Remove/replace automatic endpoint registration claim.
3. Document the `defineRoute` pattern consumers must use.

#### TDD

(none — documentation change)

#### Concurrency tests

(none — single-threaded)

#### Acceptance Criteria
- [ ] No false claims about automatic endpoint registration — `grep -c 'automatic.*endpoint\|zero extra files' packages/plugin-voice/README.md` returns 0
- [ ] Status reflects actual capabilities — `grep -c 'STT\|TTS' packages/plugin-voice/README.md` returns ≥ 2
- [ ] Consumer guidance for defineRoute included — `grep -c 'defineRoute' packages/plugin-voice/README.md` returns ≥ 1

#### DoD
- [ ] README accurately reflects implementation

---

### T6.2 — Update plugin-realtime README

#### Objective
Document the local-only limitation of `useBroadcast()` and `updateMyPresence()`.

#### Why this step
Finding #5 (LOW) — README documents these as functional fire-and-forget operations without noting that they are local-only (no server wire).

#### Files to edit
```
packages/plugin-realtime/README.md — add local-only limitation note
```

#### Tasks
1. Add a note in the API section that `useBroadcast()` and `updateMyPresence()` are local-only in the current version.

#### TDD

(none — documentation change)

#### Concurrency tests

(none — single-threaded)

#### Acceptance Criteria
- [ ] Local-only limitation clearly documented — `grep -c 'local-only\|local only' packages/plugin-realtime/README.md` returns ≥ 1
- [ ] No false claims about server-side wire — `grep -c 'server.*wire\|server-side fanout' packages/plugin-realtime/README.md` returns 0 (or note says "local-only")

#### DoD
- [ ] README accurately reflects implementation

---

## Coverage Matrix

| # | Gap / Requirement (Finding ID) | Task(s) | Resolution |
|---|---|---|---|
| 1 | SQL injection via table name (F#108) | T1.1 | Table name validation at construction |
| 2 | SVG sanitizer regex bypass (F#129) | T1.2, T4.2 | DOMPurify replacement + bypass regression tests |
| 3 | CopilotRuntime race condition (F#132) | T2.1 | Per-registration Promise queue |
| 4 | Swallowed onAfterInsert error (F#133) | T3.1 | Error logging with context |
| 5 | API key exposure (F#134) | T1.3, T4.3 | Thunk pattern + non-leakage test |
| 6 | Mermaid lazy loader race (F#130) | T2.2 | Single-flight pattern |
| 7 | Yjs lazy loader race (F#131) | T2.2 | Single-flight pattern |
| 8 | BudgetBridge 30-day month (F#135) | T2.3 | Calendar month boundaries |
| 9 | CopilotRuntime.deactivate undefined (F#136) | T2.1 | Fixed as part of serialization refactor |
| 10 | Listener errors swallowed (F#137) | T3.2 | Error logging per listener |
| 11 | Unchecked ArtifactKind assertion (F#138) | T2.4 | Runtime validation against enum |
| 12 | ResendProvider error context (F#139) | T3.6 | Error cause chain preservation |
| 13 | enforceArtifactSecurity gaps (F#140) | T1.2 | Delegated to DOMPurify via sanitize module |
| 14 | CopilotRuntime.runAgent swallows errors (F#142) | T3.3 | Rethrow after broadcast |
| 15 | CopilotProvider usage tracking (F#144) | T2.1 | Addressed by serialization (render stability) |
| 16 | Error message leakage (F#146) | T1.4 | Generic 500 messages |
| 17 | WebhookRegistry stop-on-first (F#147) | T3.5 | Continue + throw first error + log rest (EC-2 revised: no AggregateError) |
| 18 | Devtools iframe sandbox (F#150) | T1.5 | sandbox attribute added |
| 19 | TheoForm swallows errors (F#155) | T3.4 | Rethrow non-ActionInputError |
| 20 | plugin-voice README false claim (F#2) | T6.1 | README updated |
| 21 | SQLite adapter zero test coverage (F#156) | T4.1 | SQLite adapter test suite |
| 22 | SVG sanitizer bypass tests missing (F#157) | T4.2 | Bypass vector regression tests |
| 23 | API key leakage untested (F#159) | T4.3 | Non-leakage assertion |
| 24 | Reducer CC=158 (complexity) | T5.1 | Extract per-action handlers |
| 25 | CanvasPanel CC=115 (complexity) | T5.2 | Extract sub-components |
| 26 | createSqliteArtifactStore CC=97 (complexity) | T5.3 | Extract per-query methods |
| 27 | plugin-voice README status line (F#3) | T6.1 | Status updated |
| 28 | plugin-realtime local-only limitation (F#5) | T6.2 | Limitation documented |

| 29 | EC-1: DOMPurify removed shape → boolean SanitizeReport mapping | T1.2 | Map removed array to existing boolean flags via hooks |
| 30 | EC-2: WebhookRegistry AggregateError breaking change | T3.5 | Revised: throw first error, log rest (preserve contract) |
| 31 | EC-3: deactivate() must drain Promise queue before leave() | T2.1 | Await queue drain before member.leave() |

**Coverage: 31/31 gaps covered (100%)**

## Global Definition of Done

- [ ] All phases completed
- [ ] All tests pass — `pnpm test` exits 0ing — `pnpm test` green across all 11 packages
- [ ] Zero type errors — `pnpm typecheck` exits 0 — `pnpm typecheck`
- [ ] Zero lint warnings — `pnpm lint` exits 0 — `pnpm lint`
- [ ] File-size budget respected — every changed file ≤ 500 LoC
- [ ] CHANGELOG.md updated under `[Unreleased]` (Unbreakable Rule 6)
- [ ] Backward compatibility preserved across public API (no breaking type changes except D3 apiKey union)
- [ ] All 23 blocking findings resolved (re-verify with `/code-quality`)
- [ ] Top-3 complexity hotspots reduced below CC=25
- [ ] Security regression tests cover all 7 security findings
- [ ] Plan archived — after merge, move to `knowledge-base/plans/completed/`

## Failure scenarios

| Dependency | Failure mode | How the test reproduces it | Expected behavior |
|---|---|---|---|
| SQLite (local disk I/O in `createSqliteArtifactStore`) | Database file locked by another process | Use `better-sqlite3` with a second connection holding an exclusive lock; attempt insert from the store | Store throws `SQLITE_BUSY` error; caller receives typed error, not silent data loss |
| SQLite (local disk I/O in `createSqliteArtifactStore`) | Disk full / read-only filesystem | Mock `better-sqlite3` `prepare().run()` to throw `SQLITE_FULL` | Store throws; error propagated to route-handler; HTTP 500 returned with generic message (T1.4) |
| Resend API (HTTP in `ResendProvider.send`) | API returns 429 rate limit | Mock Resend SDK `.send()` to reject with rate-limit error | `ResendProvider` wraps error with cause chain (T3.6); caller receives typed error |

## Final Phase: Integration Validation (MANDATORY)

**Objective:** Validate that all implemented changes work together across the entire monorepo.

### Execution

Run the full validation chain:

- `pnpm test` — unit + integration tests across all 11 packages
- `pnpm typecheck` — zero type errors
- `pnpm lint` — zero lint warnings
- `pnpm build` — build all packages (catch compile errors)

### Acceptance Criteria

- [ ] All test suites green (511+ existing + ~25 new tests)
- [ ] Zero type errors — `pnpm typecheck` exits 0
- [ ] Zero lint warnings — `pnpm lint` exits 0
- [ ] Build succeeds for all 11 packages — `pnpm build` exits 0
- [ ] No regressions in existing test suite — `pnpm test` exits 0 with ≥ 511 test cases passing

### If Validation Fails

1. Identify which failures are caused by this plan's changes vs pre-existing
2. Fix all plan-caused failures before declaring the plan complete
3. Re-run the validation chain to confirm fixes
4. Pre-existing issues are logged but do NOT block plan completion
