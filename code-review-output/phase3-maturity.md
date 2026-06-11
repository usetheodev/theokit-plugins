# Phase 3 — Maturity Detective Report

**Date:** 2026-06-11
**Category:** maturity | **Severity source:** heuristic (all findings)
**Blocking:** none (maturity findings are advisory nits)

## Summary

| Sub-category | Count | Severity |
|---|---|---|
| vague_name | 6 | low |
| duplication | 7 | 3 medium, 4 low |
| magic_literal | 3 | low |
| verbose_boolean | 1 | low |
| what_comment | 1 | info |
| silent_catch | 1 | low |
| dead_code | 1 | low |
| **Total** | **20** | |

Three findings elevated to **medium** due to cross-package structural duplication (base error class, OAuth token exchange, tsup.config.ts). The rest are low/info-severity single-site findings.

---

## Findings

### [Nit: medium] Duplication — Base error class pattern

**Files:** `packages/plugin-copilot/src/types.ts:200`, `packages/plugin-realtime/src/types.ts:193`

`CopilotError` and `RealtimeError` are structurally identical: same constructor signature (`message, { code?, cause? }`), same conditional cause forwarding, same `code` property. Hunt & Thomas DRY: extract a shared base.

```ts
// Both files contain this exact structure:
export class CopilotError extends Error {  // or RealtimeError
  override readonly name: string = "CopilotError";
  readonly code?: string;
  constructor(message: string, options: { code?: string; cause?: unknown } = {}) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    if (options.code !== undefined) this.code = options.code;
  }
}
```

**Remediation:** Extract a shared `PluginError` base class into a workspace-level package. Both become one-line extends.

---

### [Nit: medium] Duplication — OAuth token exchange (auth-github / auth-google)

**Files:** `packages/auth-github/src/index.ts:100`, `packages/auth-google/src/index.ts:111`

12+ contiguous lines of identical structure: URLSearchParams construction, fetch POST, status check, access_token validation. Plus `parseCallbackUrl()` is copy-pasted verbatim in both files (line 51 and 52 respectively).

**Remediation:** Extract `exchangeAuthorizationCode(endpoint, params, headers?)` and `parseCallbackUrl(req)` into a shared auth-utils module.

---

### [Nit: medium] Duplication — tsup.config.ts across 7 packages

**Files:** All of auth-github, auth-google, auth-magic-link, plugin-email, plugin-forms, plugin-payments, plugin-db-drizzle

Identical 8-line config differing only in the `external` array.

**Remediation:** Create `tsup.base.ts` at workspace root with a `createTsupConfig(overrides)` factory.

---

### [Nit: low] Vague variable names

| File | Line | Name | Scope LOC | Suggested rename |
|---|---|---|---|---|
| `plugin-canvas/src/ui/renderers/sanitize.ts` | 54 | `output` | 42 | `sanitizedMarkup` |
| `plugin-canvas/src/ui/renderers/sanitize.ts` | 104 | `output` | 16 | `sanitizedHtml` |
| `plugin-voice/src/stt-server.ts` | 160 | `obj` | 16 | `bufferCarrier` |
| `plugin-voice/src/stt-server.ts` | 180 | `obj` | 7 | `namedAudio` |
| `plugin-email/src/resend-provider.ts` | 69 | `result` | 20 | `sendResponse` |
| `plugin-canvas/src/route-handlers.ts` | 63 | `f` | 19 | `filter` |

Single-letter `n` is also reused for two different parsed values at route-handlers.ts:73 and :77 (should be `parsedOffset` / `parsedLimit`).

**Principle:** Clean Code Ch.2 -- use intention-revealing names.

---

### [Nit: low] Magic literals

| File | Line | Value | Suggested constant |
|---|---|---|---|
| `plugin-canvas/src/route-handlers.ts` | 78 | `1000` | `MAX_LIST_LIMIT` |
| `plugin-canvas/src/store.ts` | 80, 259 | `200` | `DEFAULT_LIST_LIMIT` |
| `plugin-copilot/src/internal/runtime.ts` | 88 | `0.01` | `DEFAULT_ESTIMATED_COST_USD` |

---

### [Nit: low] Duplication — SanitizeReport initializer (same file)

**File:** `packages/plugin-canvas/src/ui/renderers/sanitize.ts:45` and `:95`

Identical 7-line object literal. Extract `emptySanitizeReport(): SanitizeReport`.

---

### [Nit: low] Duplication — createdAt sort comparator

**Files:** `packages/plugin-canvas/src/store.ts:91`, `packages/plugin-canvas/src/ui/use-canvas.ts:304`

Same 5-line comparator handling string|number createdAt. Extract `compareByCreatedAtDesc()`.

---

### [Nit: low] Dead conditional — store.ts:288

```ts
const finalParams = mode === 'latest' ? [...params, limit, offset] : [...params, limit, offset]
```

Both branches produce the identical array. The ternary is dead logic.

**Remediation:** Simplify to `const finalParams = [...params, limit, offset]`.

---

### [Nit: low] Verbose boolean — extract-artifacts.ts:129

`isInsideAnySpan()` uses a loop + early `return true` + final `return false`. Replaceable with `spans.some(([a, b]) => index >= a && index < b)`.

---

### [Nit: low] Silent catch — react/index.ts:177

RoomProvider's subscription lifecycle has an empty `catch {}` that silently swallows errors. The consumer has no way to know the subscription failed. Surface via error state or callback.

---

### [Nit: info] WHAT-comment — memory-provider.ts:118

```ts
// Return a snapshot (shallow copy) so callers can't mutate internal state.
```

The WHY portion is valuable; the WHAT portion paraphrases the code. Trim to the WHY only.

---

## Aggregate Assessment

The codebase demonstrates strong maturity signals overall: well-documented module headers, typed error hierarchies, boundary validation, and thoughtful edge-case handling. The findings above are refinement opportunities, not structural problems. The three medium-severity duplications (error base class, OAuth exchange, tsup config) are the highest-leverage items -- addressing them would reduce maintenance surface across the monorepo.

No finding is blocking. All carry `severity_source=heuristic`.
