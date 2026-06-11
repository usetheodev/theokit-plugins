# Phase 3 — Design Pattern Analysis

**Date:** 2026-06-11
**Specialist:** pattern-suggester
**Target:** theokit-plugins monorepo (11 packages)
**Methodology:** Two-signal minimum per pattern catalog; all findings `blocking=0`, `severity_source=heuristic`

---

## Summary

Analyzed 11 plugin packages for 7 canonical design patterns (Strategy, Factory, Repository, Observer, Mediator, Builder, Value Object) plus misapplied-pattern detection.

**Overall assessment:** The codebase demonstrates strong pattern awareness. Several patterns are already correctly applied (Observer via `ArtifactBus` and `WebhookRegistry`, Strategy via `CopilotDispatcher` and `ArtifactRendererRegistry`, Repository via `ArtifactStore` interface). Found 3 actionable findings and 1 pattern already well-applied (noted for completeness).

---

## Findings

### Finding 1: misapplied_pattern — `defineEmailProvider` is an identity function with no value

**File:** `packages/plugin-email/src/provider.ts:26`
**Pattern:** Factory (misapplied)
**Severity:** low
**Verdict:** misapplied

**Structural signals:**
1. The function takes an `EmailProvider` and returns the same `EmailProvider` unchanged (line 26: `return impl;`). No validation, no construction, no discriminator, no variant selection.
2. The name `defineEmailProvider` implies a factory/builder, but the shape is `(x: T) => T` -- a pure identity function.

**Evidence:**
```typescript
export function defineEmailProvider(impl: EmailProvider): EmailProvider {
  return impl;
}
```

Compare with `defineRealtimeProvider` (same pattern BUT with 6 runtime validation checks at `packages/plugin-realtime/src/provider.ts:34-58`) -- that one earns its existence. `defineEmailProvider` does not.

**Remediation:** Either add runtime validation of the `EmailProvider` contract (name, send method presence -- matching `defineRealtimeProvider`'s approach), or remove the function and let consumers implement `EmailProvider` directly. The JSDoc says "Pass-through that exists for documentation symmetry" -- documentation symmetry is not a justification for shipping dead code.

---

### Finding 2: strategy_candidate — `enforceArtifactSecurity` uses kind-keyed if-chain that will grow with new kinds

**File:** `packages/plugin-canvas/src/schema.ts:264`
**Pattern:** Strategy (opportunity)
**Severity:** low
**Verdict:** missing

**Structural signals:**
1. Two `if (artifact.kind === '...')` branches at lines 265 and 279, keyed on the `kind` discriminator. Currently 2 arms (svg, html), but `ARTIFACT_KINDS` declares 9 kinds total, and the schema is explicitly designed to grow (discriminated union with 10 variants already at line 191-202).
2. The security checks are semantically per-kind (SVG checks for `<script>` and `javascript:` hrefs; HTML checks for `<meta refresh>`). New kinds (e.g., a future `json` or `wasm` kind) will add more arms to the same function.

**Why this is borderline (honesty):** With only 2 arms today, this does NOT meet the 4-arm threshold for a strong Strategy recommendation. I am flagging it at `low` severity as a future-awareness note, not a current defect. The open/closed signal is real: adding a new kind's security checks requires editing `enforceArtifactSecurity` rather than registering a check alongside the schema variant.

**Evidence:**
```typescript
// schema.ts:264-287 — 2 arms today, 9 kinds declared
if (artifact.kind === 'svg') { /* 2 checks */ }
if (artifact.kind === 'html') { /* 1 check */ }
// markdown, code, diff, whiteboard-scene, slide-deck, mermaid, image — no security checks yet
```

**Remediation:** When a third kind gains security checks, extract a `securityChecks: Partial<Record<ArtifactKind, (a: Artifact) => void>>` registry. Each kind registers its own checks. `enforceArtifactSecurity` becomes a dispatcher: `securityChecks[artifact.kind]?.(artifact)`. This collocates kind-specific logic without touching the dispatcher.

---

### Finding 3: strategy_candidate — `ensureVoicePeer` and `ensureCanvasPeer` are structurally identical peer-check functions

**File:** `packages/plugin-copilot/src/internal/voice-bridge.ts:19` and `packages/plugin-copilot/src/internal/canvas-bridge.ts:17`
**Pattern:** Strategy (opportunity) / DRY
**Severity:** low
**Verdict:** missing

**Structural signals:**
1. Both functions share the exact same structure: (a) check if config is undefined/disabled, return `{ enabled: false }`, (b) dynamic `import()` of a peer package, (c) return `{ enabled: true }` on success, (d) throw `CopilotConfigError` with an actionable message on `catch`.
2. The only differences are: the config type (`CopilotVoiceConfig` vs `CopilotCanvasConfig`), the guard condition (`transcribeWith === undefined && speakWith === undefined` vs `!config.emitArtifacts`), the import path (`@theokit/plugin-voice` vs `@theokit/plugin-canvas`), and the error message string.

**Evidence (side-by-side diff shape):**
```
voice-bridge.ts:19-38                    canvas-bridge.ts:17-35
export async function ensureVoicePeer(   export async function ensureCanvasPeer(
  config: CopilotVoiceConfig | undef     config: CopilotCanvasConfig | undef
): Promise<{ enabled: boolean }> {       ): Promise<{ enabled: boolean }> {
  if (config === undefined) return...     if (config === undefined || !config.emitArtifacts)
  if (... === undefined && ...) return    return { enabled: false };
  try {                                   try {
    await import("@theokit/plugin-voice") await import("@theokit/plugin-canvas")
    return { enabled: true };             return { enabled: true };
  } catch (cause) {                       } catch (cause) {
    throw new CopilotConfigError(...)     throw new CopilotConfigError(...)
  }                                       }
}                                         }
```

**Why this is borderline (honesty):** Two instances is below the Rule of 3 for extraction. The files are small (39 and 35 lines). The cost of the duplication is low today. However, the `CopilotDescriptor` type already has room for more opt-in peers (rate-limit, budget, future integrations), and each new peer would copy this same template.

**Remediation:** Extract a generic `ensurePeer(opts: { config: unknown; isEnabled: (c: unknown) => boolean; importPath: string; errorCode: string; errorMessage: string }): Promise<{ enabled: boolean }>` helper. Both bridges become one-liner calls to `ensurePeer(...)`.

---

### Finding 4 (positive — no action): Observer pattern well-applied in `ArtifactBus` and `WebhookRegistry`

**File:** `packages/plugin-canvas/src/server/artifact-bus.ts:44` and `packages/plugin-payments/src/webhook.ts:75`
**Pattern:** Observer / Pub-Sub
**Severity:** info (no finding emitted to DB)
**Verdict:** applied_correctly

Both implementations correctly follow Observer:
- `ArtifactBus`: keyed by `conversationId`, `emit()` fans out to all subscribers, handler isolation via try/catch (line 54-60), proper unsubscribe cleanup.
- `WebhookRegistry`: keyed by `eventType`, LIFO dispatch order (documented), type-erased storage with safe cast on dispatch, idempotency concern properly separated to `IdempotencyStore`.

No action required. This is noted for completeness.

---

## Patterns NOT found (honest negatives)

These patterns were searched for but insufficient structural signals were present:

| Pattern | Signals checked | Result |
|---|---|---|
| **Repository** | SQL queries in service code; ORM session passed around | `ArtifactStore` is already a clean Repository interface. No raw SQL in service layers. |
| **Builder** | >=5 chained setters; >4 optional constructor params | `CopilotRuntimeOptions` has 6 fields but most are required (provider, agent). `CopilotDescriptor` has 9 fields but is constructed via `defineCopilot()` which is effectively a builder. No repeated setup sequences. |
| **Value Object** | Same tuple passed through >=3 boundaries; field-by-field equality | Not observed. The codebase uses Zod schemas and TypeScript interfaces correctly. |
| **Mediator** | Central hub wiring >=3 axes of interaction | `CopilotRuntime` wires provider + agent + triggers + budget + voice + canvas, which structurally IS a Mediator. It is correctly implemented and correctly named "runtime" (not "mediator"), which is fine -- naming it Mediator would be over-labeling. |

---

## Methodology notes

- Searched all `src/` files across 11 packages (approximately 80 production source files).
- Applied the two-signal-minimum rule strictly. Multiple potential observations were discarded because only one structural signal was present.
- Pattern suggestions are inherently subjective. All findings are `blocking=0` and `severity_source=heuristic`.
- The codebase is well-structured with clear interface boundaries. The low finding count reflects genuine design quality, not insufficient analysis.
