# Phase 3 — Complexity Scanner Report

**Tool:** lizard (cyclomatic complexity analyzer)
**Severity source:** `consensus` (McCabe 1976 NIST thresholds)
**Date:** 2026-06-11
**Target:** packages/*/src/ (TypeScript monorepo)

## Summary

| Severity | Count | CC Range | McCabe Classification |
|---|---|---|---|
| critical | 26 | CC > 25 | Very high risk / untestable |
| high | 36 | CC 16-25 | High risk |
| medium | 11 | CC 11-15 | Moderate risk |
| **Total** | **73** | | |

Large parameter lists (>5 params): 4
Files > 200 LOC: 15

## Critical Findings (CC > 25)

| CC | Function | File | Line | NLOC | Severity |
|---|---|---|---|---|---|
| 158 | `reducer` | `packages/plugin-canvas/src/ui/use-canvas.ts` | 53 | — | critical |
| 115 | `CanvasPanel` | `packages/plugin-canvas/src/ui/canvas-panel.tsx` | 63 | — | critical |
| 97 | `createSqliteArtifactStore` | `packages/plugin-canvas/src/store.ts` | 178 | — | critical |
| 70 | `CopilotChat` | `packages/plugin-copilot/src/react/CopilotChat.tsx` | 47 | — | critical |
| 63 | `defineCopilot` | `packages/plugin-copilot/src/define-copilot.ts` | 74 | — | critical |
| 60 | `handleFrame` | `packages/plugin-copilot/src/react/copilot-provider.tsx` | 125 | — | critical |
| 60 | `(anonymous useEffect)` | `packages/plugin-realtime/src/react/index.ts` | 119 | — | critical |
| 57 | `handleSttRequest` | `packages/plugin-voice/src/stt-server.ts` | 67 | — | critical |
| 56 | `google` | `packages/auth-google/src/index.ts` | 57 | — | critical |
| 51 | `github` | `packages/auth-github/src/index.ts` | 59 | — | critical |
| 50 | `handleTtsRequest` | `packages/plugin-voice/src/tts-server.ts` | 43 | — | critical |
| 47 | `extractArtifactCandidates` | `packages/plugin-canvas/src/ui/extract-artifacts.ts` | 47 | — | critical |
| 44 | `handleCallback` | `packages/auth-google/src/index.ts` | 83 | — | critical |
| 43 | `useTts` | `packages/plugin-voice/src/ui/use-tts.ts` | 70 | — | critical |
| 39 | `serializeArtifactForCopy` | `packages/plugin-canvas/src/ui/artifact-actions.ts` | 104 | — | critical |
| 38 | `handleCallback` | `packages/auth-github/src/index.ts` | 81 | — | critical |
| 38 | `handler` | `packages/plugin-realtime/src/internal/server-integration.ts` | 179 | — | critical |
| 36 | `(anonymous JSX render)` | `packages/plugin-voice/src/ui/voice-recorder-bar.tsx` | 144 | — | critical |
| 36 | `handler` | `packages/plugin-canvas/src/define-artifact-tool.ts` | 148 | — | critical |
| 35 | `createInMemoryArtifactStore` | `packages/plugin-canvas/src/store.ts` | 49 | — | critical |
| 33 | `processWebhook` | `packages/plugin-payments/src/webhook.ts` | 151 | — | critical |
| 30 | `mapMediaError` | `packages/plugin-voice/src/recorder.ts` | 242 | — | critical |
| 30 | `create (route handler)` | `packages/plugin-canvas/src/route-handlers.ts` | 103 | — | critical |
| 27 | `defineRealtimeProvider` | `packages/plugin-realtime/src/provider.ts` | 33 | — | critical |
| 27 | `defaultResolveEmail` | `packages/auth-magic-link/src/index.ts` | 60 | — | critical |
| 26 | `insert (sqlite)` | `packages/plugin-canvas/src/store.ts` | 214 | — | critical |

### Top 5 worst offenders

1. **`reducer`** at `packages/plugin-canvas/src/ui/use-canvas.ts:53` — CC=158
   URGENT: Function is untestable per McCabe. Decompose into 5+ smaller functions with single responsibility.

2. **`CanvasPanel`** at `packages/plugin-canvas/src/ui/canvas-panel.tsx:63` — CC=115
   URGENT: Function is untestable per McCabe. Decompose into 5+ smaller functions with single responsibility.

3. **`createSqliteArtifactStore`** at `packages/plugin-canvas/src/store.ts:178` — CC=97
   URGENT: Function is untestable per McCabe. Decompose into 5+ smaller functions with single responsibility.

4. **`CopilotChat`** at `packages/plugin-copilot/src/react/CopilotChat.tsx:47` — CC=70
   URGENT: Function is untestable per McCabe. Decompose into 5+ smaller functions with single responsibility.

5. **`defineCopilot`** at `packages/plugin-copilot/src/define-copilot.ts:74` — CC=63
   URGENT: Function is untestable per McCabe. Decompose into 5+ smaller functions with single responsibility.

## High Findings (CC 16-25)

| CC | Function | File | Line | Severity |
|---|---|---|---|---|
| 25 | `slugifyFilename` | `packages/plugin-canvas/src/ui/artifact-actions.ts` | 65 | high |
| 25 | `evaluate` | `packages/plugin-copilot/src/internal/trigger-evaluator.ts` | 38 | high |
| 25 | `createStripeClientGetter` | `packages/plugin-payments/src/stripe-client.ts` | 34 | high |
| 24 | `handleCallback` | `packages/auth-magic-link/src/index.ts` | 144 | high |
| 23 | `preflightCheck` | `packages/plugin-copilot/src/internal/budget-bridge.ts` | 65 | high |
| 23 | `useTheoField` | `packages/plugin-forms/src/hooks/useTheoField.ts` | 40 | high |
| 23 | `mapErrorToState` | `packages/plugin-voice/src/ui/voice-recorder-bar.tsx` | 256 | high |
| 22 | `walkErrorsByPath` | `packages/plugin-forms/src/hooks/useTheoField.ts` | 73 | high |
| 22 | `getOrInitState` | `packages/plugin-copilot/src/internal/budget-bridge.ts` | 37 | high |
| 22 | `createYjsRealtimeProvider` | `packages/plugin-realtime/src/yjs-provider.ts` | 131 | high |
| 21 | `sanitizeSvg` | `packages/plugin-canvas/src/ui/renderers/sanitize.ts` | 44 | high |
| 21 | `rowToArtifact` | `packages/plugin-canvas/src/store.ts` | 157 | high |
| 21 | `send` | `packages/plugin-email/src/resend-provider.ts` | 66 | high |
| 21 | `defaultMagicLinkHtml` | `packages/plugin-email/src/magic-link.ts` | 59 | high |
| 21 | `(anonymous sendMagicLink inner)` | `packages/plugin-email/src/magic-link.ts` | 136 | high |
| 21 | `createRecorder` | `packages/plugin-voice/src/recorder.ts` | 78 | high |
| 21 | `parseListFilter` | `packages/plugin-canvas/src/route-handlers.ts` | 62 | high |
| 20 | `buildPayload` | `packages/plugin-email/src/resend-provider.ts` | 99 | high |
| 20 | `ensureSecureContext` | `packages/plugin-voice/src/recorder.ts` | 93 | high |
| 19 | `defineArtifactTool` | `packages/plugin-canvas/src/define-artifact-tool.ts` | 129 | high |
| 19 | `constructor (CopilotRuntime)` | `packages/plugin-copilot/src/internal/runtime.ts` | 74 | high |
| 19 | `check (idle)` | `packages/plugin-copilot/src/internal/trigger-evaluator.ts` | 81 | high |
| 19 | `verifyAndParseWebhook` | `packages/plugin-payments/src/webhook.ts` | 115 | high |
| 18 | `defaultMagicLinkText` | `packages/plugin-email/src/magic-link.ts` | 81 | high |
| 18 | `sanitizeHtmlSrcdoc` | `packages/plugin-canvas/src/ui/renderers/sanitize.ts` | 94 | high |
| 17 | `resolveTts` | `packages/plugin-voice/src/options.ts` | 110 | high |
| 17 | `sendMagicLink` | `packages/plugin-email/src/magic-link.ts` | 121 | high |
| 17 | `validateEmail` | `packages/auth-magic-link/src/index.ts` | 91 | high |
| 17 | `ensureVoicePeer` | `packages/plugin-copilot/src/internal/voice-bridge.ts` | 19 | high |
| 17 | `ImageArtifact` | `packages/plugin-canvas/src/ui/renderers/image-artifact.tsx` | 19 | high |
| 17 | `HtmlArtifact` | `packages/plugin-canvas/src/ui/renderers/html-artifact.tsx` | 35 | high |
| 17 | `CodeArtifact` | `packages/plugin-canvas/src/ui/renderers/code-artifact.tsx` | 10 | high |
| 16 | `resolveStt` | `packages/plugin-voice/src/options.ts` | 94 | high |
| 16 | `formatAmountForStripe` | `packages/plugin-payments/src/currency.ts` | 16 | high |
| 16 | `ensureCanvasPeer` | `packages/plugin-copilot/src/internal/canvas-bridge.ts` | 17 | high |
| 16 | `getUsage` | `packages/plugin-copilot/src/internal/budget-bridge.ts` | 101 | high |

## Medium Findings (CC 11-15)

| CC | Function | File | Line | Severity |
|---|---|---|---|---|
| 15 | `createMemoryRealtimeProvider` | `packages/plugin-realtime/src/memory-provider.ts` | 36 | medium |
| 14 | `emit` | `packages/plugin-canvas/src/server/artifact-bus.ts` | 48 | medium |
| 14 | `presenceFromMap` | `packages/plugin-copilot/src/react/copilot-provider.tsx` | 111 | medium |
| 14 | `constructor (RealtimeRuntime)` | `packages/plugin-realtime/src/internal/runtime.ts` | 71 | medium |
| 13 | `insert (memory)` | `packages/plugin-canvas/src/store.ts` | 55 | medium |
| 13 | `matchesTrigger` | `packages/plugin-copilot/src/internal/trigger-evaluator.ts` | 123 | medium |
| 13 | `errorToResponse` | `packages/plugin-canvas/src/route-handlers.ts` | 173 | medium |
| 13 | `extractArtifactCandidate` | `packages/plugin-canvas/src/define-artifact-tool.ts` | 105 | medium |
| 13 | `SvgArtifact` | `packages/plugin-canvas/src/ui/renderers/svg-artifact.tsx` | 18 | medium |
| 12 | `toBlob` | `packages/plugin-voice/src/stt-server.ts` | 157 | medium |
| 11 | `frameToOutput` | `packages/plugin-realtime/src/internal/server-integration.ts` | 69 | medium |

## Large Parameter Lists (>5 params)

| Params | Function | File | Line |
|---|---|---|---|
| 11 | `CanvasPanel` | `packages/plugin-canvas/src/ui/canvas-panel.tsx` | 63 |
| 8 | `OpenInCanvasButton` | `packages/plugin-canvas/src/ui/open-in-canvas-button.tsx` | 44 |
| 6 | `handleFrame` | `packages/plugin-copilot/src/react/copilot-provider.tsx` | 125 |
| 11 | `VoiceRecorderBar` | `packages/plugin-voice/src/ui/voice-recorder-bar.tsx` | 81 |

## Files > 200 LOC (cross-reference with CC)

| LOC | File | Note |
|---|---|---|
| 287 | `packages/plugin-canvas/src/schema.ts` | info — check per-function CC |
| 324 | `packages/plugin-canvas/src/store.ts` | info — check per-function CC |
| 236 | `packages/plugin-canvas/src/ui/canvas-panel.tsx` | info — check per-function CC |
| 219 | `packages/plugin-canvas/src/ui/renderers/markdown.tsx` | info — check per-function CC |
| 325 | `packages/plugin-canvas/src/ui/use-canvas.ts` | info — check per-function CC |
| 299 | `packages/plugin-copilot/src/internal/runtime.ts` | info — check per-function CC |
| 254 | `packages/plugin-copilot/src/types.ts` | info — check per-function CC |
| 244 | `packages/plugin-realtime/src/internal/runtime.ts` | info — check per-function CC |
| 245 | `packages/plugin-realtime/src/internal/server-integration.ts` | info — check per-function CC |
| 297 | `packages/plugin-realtime/src/react/index.ts` | info — check per-function CC |
| 264 | `packages/plugin-realtime/src/types.ts` | info — check per-function CC |
| 272 | `packages/plugin-realtime/src/yjs-provider.ts` | info — check per-function CC |
| 282 | `packages/plugin-voice/src/recorder.ts` | info — check per-function CC |
| 233 | `packages/plugin-voice/src/ui/use-tts.ts` | info — check per-function CC |
| 278 | `packages/plugin-voice/src/ui/voice-recorder-bar.tsx` | info — check per-function CC |

## Methodology

- **Tool:** lizard v1.x (`lizard --csv -l typescript -l javascript -l tsx`)
- **Threshold:** CC > 10 = finding (McCabe 1976 NIST consensus)
- **Severity mapping:** CC 11-15 = medium, CC 16-25 = high, CC > 25 = critical
- **severity_source:** `consensus` for all CC-measured findings
- **blocking:** `false` for all complexity findings (advisory)
- **LOC and parameter findings:** `severity_source=heuristic`, `severity=info`

All findings persisted to `code-review-output/code-review.db` (table: findings, phase=3, category=complexity).
Raw lizard output: `code-review-output/audit/lizard_cc.csv`.