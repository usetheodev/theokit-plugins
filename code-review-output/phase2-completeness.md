# Phase 2 -- Completeness Audit

**Auditor:** completeness-auditor
**Date:** 2026-06-11
**Scope:** 11 packages under `packages/` in the theokit-plugins monorepo
**Files inspected:** 35 source files across all 11 packages (index.ts barrels, implementation modules, options, types)

---

## Summary

| Severity | Count |
|----------|-------|
| critical | 0 |
| high     | 1 |
| medium   | 3 |
| low      | 1 |
| info     | 7 |

The monorepo is generally well-implemented. No TODO/FIXME markers or `throw new Error('not implemented')` stubs were found in any production source file (the single grep hit was a test payload variable name). All 11 packages have substantive implementations behind their public APIs. The issues found are concentrated in two packages: `plugin-voice` (README out of sync with architecture change) and `plugin-realtime` (exported stub + undocumented local-only limitations in React hooks).

---

## Actionable Findings

### HIGH: plugin-voice README claims automatic endpoint registration; implementation is a no-op

**File:** `packages/plugin-voice/src/index.ts:1062`
**Category:** gap (promise vs implementation)

README line 8 states: *"install it, register it once in theo.config.ts, get /api/voice/stt + /api/voice/tts HTTP endpoints automatically. Zero extra files in server/routes/".*

The `voicePlugin()` function's `register()` body is intentionally empty. The index.ts docstring (lines 989-1003) explicitly documents a post-dogfood architecture correction: the framework's `api-middleware.ts` returns 404 before plugin hooks run, so consumers MUST write `defineRoute` shims. The README promise directly contradicts the implementation.

**Remediation:** Update README "Why this plugin" section to remove the automatic endpoint claim. Document the `defineRoute` shim pattern as the canonical integration path.

---

### MEDIUM: Exported hook useYDoc always throws (stub)

**File:** `packages/plugin-realtime/src/react/index.ts:293`
**Category:** stub

`useYDoc()` is exported from the `/react` sub-path and listed in the README hook table (line 103). Its body unconditionally throws an Error. The CHANGELOG does note this, but the function is still part of the public API surface -- consumers can import it and get a runtime crash with no compile-time guard (return type is `never` but that requires strict type checking to surface).

**Remediation:** Either remove `useYDoc` from the public barrel until implemented, or add `@deprecated` JSDoc and `@throws` annotations.

---

### MEDIUM: plugin-voice README status line is stale

**File:** `packages/plugin-voice/src/index.ts:4` (via README line 4)
**Category:** gap (promise vs implementation)

README states: *"Status: 0.1.0 -- scaffold only. STT handler ships in 0.2.0 (T3.2), TTS in 0.3.0 (T3.3), UI components in 0.4.0 (T3.4)."*

The codebase contains full implementations: `handleSttRequest` (194 lines), `handleTtsRequest` (150 lines), and 4+ UI components (`VoiceRecorderBar`, `TalkOptions`, `useTts`, `VoiceAlert`). The index.ts docstring references version 0.5.0. The status line is misleading.

**Remediation:** Update to reflect actual version (at least 0.5.0 per docstring).

---

### MEDIUM: useBroadcast() and updateMyPresence() are local-only; README documents them as functional

**File:** `packages/plugin-realtime/src/react/index.ts:201`
**Category:** gap (promise vs implementation)

`emitBroadcast` (line 201) is a complete no-op (empty body). `emit`/`updateMyPresence` (line 196) only updates local React state without sending to the server. The code comments acknowledge this, but the README hook table (line 102) describes `useBroadcast` as *"Fire-and-forget event fanout"* without noting the local-only limitation.

**Remediation:** Add a prominent note to the README hook table and Quick Start section that v0.1 React hooks are read-only from the server subscription; writes/broadcasts do not propagate upstream.

---

### LOW: VoicePluginRuntimeOptions interface is dead code

**File:** `packages/plugin-voice/src/index.ts:92`
**Category:** dead_code

`VoicePluginRuntimeOptions` is exported with a single field `_: never`, making it impossible to instantiate. No file in the monorepo imports it. The comment says it exists for migration parity (0.4.0 to 0.5.0) but the interface carries no information.

**Remediation:** Remove `VoicePluginRuntimeOptions` or replace with a meaningful interface.

---

## Coverage Records (no issues found)

| Component | Verdict | Files Audited |
|-----------|---------|---------------|
| auth-github | no_completeness_issues | src/index.ts, src/types.ts |
| auth-google | no_completeness_issues | src/index.ts, src/types.ts |
| auth-magic-link | no_completeness_issues | src/index.ts, src/store.ts, src/types.ts |
| plugin-canvas | no_completeness_issues | src/index.ts, src/schema.ts, src/store.ts, src/define-artifact-tool.ts, src/route-handlers.ts, src/server/index.ts, src/ui/index.ts + renderers |
| plugin-copilot | no_completeness_issues | src/index.ts, src/react/index.ts, internal modules |
| plugin-db-drizzle | no_completeness_issues | src/index.ts, src/options.ts, src/types.ts |
| plugin-email | no_completeness_issues | src/index.ts + 6 modules |
| plugin-forms | no_completeness_issues | src/index.ts + adapter, components, context, hooks |
| plugin-payments | no_completeness_issues | src/index.ts, src/options.ts, src/types.ts (register() empty body is documented and correct) |

---

## Methodology

1. **Stub detection:** Searched all `.ts`/`.tsx` files for `TODO`, `FIXME`, `XXX`, `HACK`, `throw new Error('not implemented')`, empty function bodies. Only hit was a test variable name containing "HACKED" (test payload, not a stub).

2. **Promise vs implementation:** Read all 11 `README.md` files, all 11 `package.json` description fields, and all `src/index.ts` barrel files. Cross-referenced documented features against actual exports and implementation bodies.

3. **Dead code / missing exports:** Verified that every `src/index.ts` re-exports all public modules. Checked that sub-path entries (./ui, ./react, ./server) have corresponding barrel files. Searched for exported symbols with no importer. Note: since these are library packages, exports without in-monorepo importers are expected (they are consumed externally). Only flagged symbols that are demonstrably unusable (`VoicePluginRuntimeOptions` with `_: never`).

4. **Empty bodies:** Identified `register()` no-ops in `voicePlugin()` and `payments()`. The payments no-op is documented and consistent with README. The voice no-op contradicts the README claim.
