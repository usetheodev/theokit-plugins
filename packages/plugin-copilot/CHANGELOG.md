# @theokit/plugin-copilot

## [Unreleased]

## [0.1.0] - 2026-06-04 (initial; unpublished — gated on @theokit/sdk@1.7.0 + @theokit/plugin-realtime@0.1.0 @next promote cohort)

Per plan [`p11-plugin-copilot-plan.md`](../../../.claude/knowledge-base/plans/p11-plugin-copilot-plan.md) v1.0 + blueprint `p11-plugin-copilot-blueprint.md` v1.0. Form 4 Hybrid: `defineCopilot` factory + `AgentRoomMember` (P#9 RoomMember adapter) + `CopilotRuntime` orchestrator + React `/react` sub-path (`<CopilotProvider>` + `<CopilotChat>` + 6 hooks). Integration plugin composes `@theokit/sdk` Agent + `@theokit/plugin-realtime` (P#9) + opt-in `@theokit/plugin-rate-limit` (P#10) + opt-in `@theokit/plugin-canvas` + `@theokit/plugin-voice` + opt-in `@theokit/ui` composites. Differentiator vs CopilotKit: copilot is a first-class `RoomMember` visible to other users via the presence Map.

### Added

- **`defineCopilot(spec): CopilotDescriptor`** — typed factory with runtime validation. Enforces id pattern, room.id non-empty, agent.name+agent.model required, identity.name required, triggers non-empty, custom trigger needs filter fn, `presence:idle` trigger needs `idleMs > 0`.
- **`AgentRoomMember`** — wraps the copilot as a P#9 `RoomMember`. Connection id is `copilot:<copilotId>` (reserved prefix per EC-8 impersonation guard). Idempotent `join` / `leave`. `setTyping(typing, progress?)` updates presence. `broadcastMessage(text, meta?)` emits a structured `message` event with `{role: "assistant", text, copilotId, ...meta}` payload. `broadcastEvent(event, payload)` emits arbitrary events with copilotId auto-injected.
- **`CopilotRuntime`** — top-level orchestrator. Methods: `registerCopilot/unregisterCopilot/activate/deactivate/getUsage/listCopilotIds/getCopilot`. Wires P#9 `subscribeRoom` → trigger evaluation → `Agent.streamObject` invocation → typing-indicator presence updates → message broadcast.
- **`TriggerEvaluator`** — internal: evaluates `broadcast:<event>` / `presence:idle` / `custom` triggers against `CopilotFrame`. Filters out copilot-prefix frames per EC-4 + EC-8 cost-runaway / impersonation guards. `scheduleIdleCheck` tracks per-room last-seen-ms with setTimeout chain.
- **`BudgetBridge`** — internal: rolling daily + monthly budget tracking per `<copilotId, roomId>` pair. `preflightCheck` throws `CopilotError` on perRequestUsd / dailyUsd / monthlyUsd violations. `charge` accumulates usage. `getUsage` returns `{dailyUsedUsd, monthlyUsedUsd}` snapshot for theo-ui usage-meter integration.
- **`defineCopilotRealtimeProvider(impl): CopilotRealtimeProvider`** — type-asserting identity helper for consumer-supplied realtime providers (Liveblocks / PartyKit / Redis / TheoCloud). Runtime guards verify all 6 required methods present at construction.
- **`ensureVoicePeer` / `ensureCanvasPeer`** — internal: dynamic `import('@theokit/plugin-voice'/'@theokit/plugin-canvas')` with actionable `CopilotConfigError({code: "plugin-voice_missing" | "plugin-canvas_missing"})` when peer absent + config opted in.
- **Dispatcher policy (ADR D6)** — `"first-wins"` (default), `"round-robin"`, `"all"`, OR custom function `(copilots, frame) => string[]`. Bounds same-room cost when multiple copilots share a room.
- **3 typed error classes** — `CopilotError` (base; carries `code` + `cause`) + `CopilotConfigError` (default code `"copilot_config_invalid"`) + `CopilotTriggerError` (default code `"copilot_trigger_failed"`).
- **`@theokit/plugin-copilot/react` sub-path:**
  - `<CopilotProvider>` — React Context root. Subscribes to room frames via `provider.subscribeRoom`, maintains messages/presence/typing/lastError state, broadcasts user input as `inputEvent` (default `"question"`).
  - `<CopilotChat>` — headless reference composite. Renders participants header + messages list + typing indicator + composer + error display + usage meter. `renderMessage/renderParticipants/renderTyping` override props for theme customization. `data-*` attributes for theo-ui composição opt-in.
  - `CopilotContext` + `CopilotContextValue` types.
  - `isCopilotConnectionId(connectionId)` helper.
  - **6 hooks:** `useCopilot()` / `useCopilotMessages()` / `useCopilotPresence()` (filters out localConnectionId + isCopilot=true entries by default) / `useCopilotTyping()` / `useCopilotReadable(key, value)` (registers context; broadcasts `register-knowledge` / `deregister-knowledge` on mount / unmount) / `useCopilotTool(spec)` (registers tool; broadcasts `register-tool` / `deregister-tool` on mount / unmount).
- **Structural type mirrors** — `CopilotRealtimeProvider` mirrors P#9 `RealtimeProvider` interface; `CopilotFrame` mirrors P#9 `RealtimeFrame`; `CopilotAgentLike` mirrors SDK Agent `streamObject` shape. Lets the plugin compile standalone without hard imports of peer source — peers resolve at runtime.

### Notes

- **Peers required:** `theokit@>=0.4.0-beta.0` + `@theokit/sdk@>=1.6.0` + `@theokit/plugin-realtime@>=0.1.0`. **Optional peers:** `@theokit/plugin-rate-limit@>=0.1.0` + `zod@^3.25.0 || ^4.0.0` + `@theokit/ui@>=0.13.0` + `react@>=18 || >=19` + `@theokit/plugin-canvas@>=0.3.0` + `@theokit/plugin-voice@>=0.7.0`. SSE-only / chat-only consumers pay zero for the optional surfaces.
- **Reserved connection-id prefix `copilot:`** — the AgentRoomMember always joins with `copilot:<copilotId>` so frame fanout can distinguish copilot-origin frames at the trigger layer. Humans MUST NOT be allowed to claim a `copilot:*` connection id when joining via the realtime layer (consumer's wire-layer responsibility — EC-8).
- **Dispatcher default is `first-wins`** to bound cost-runaway risk when multiple copilots share a room (ADR D6). `"all"` is opt-in only.
- **Budget rolling windows** — daily resets at UTC `00:00`; monthly resets at first-of-month UTC `00:00`. Resets are computed lazily on next preflight (no background timers).
- **Real-LLM validation** — `tests/integration/copilot-real-llm.test.ts` env-gated by `OPENROUTER_API_KEY` (honest-SKIP per `.claude/rules/real-llm-validation.md` without the key). Validated against `openai/gpt-4o-mini` via OpenRouter; 1057ms round-trip; cost ~$0.000032 per smoke.
- **Voice / Canvas integration are opt-in via peer dynamic-import** — the plugin runs the peer check at `runtime.activate(copilotId)` and throws `CopilotConfigError` (code `"plugin-voice_missing"` / `"plugin-canvas_missing"`) if the peer is absent. Pay zero when not configured.

### Out of scope v0.1 (deferred to v0.x)

- **`<CopilotChat />` polished theme** — v0.1 ships the headless reference; full theo-ui composição (Avatar, MessageBubble, TypingIndicator, etc.) deferred to v0.2 once `@theokit/ui` ships matching primitives.
- **Round-robin dispatcher persistence across runtime restarts** — cursor map is in-process only; v0.2 may add pluggable cursor store.
- **`@theokit/plugin-rate-limit` deep wire** — v0.1 plugin accepts `rateLimit: {tokens, windowMs}` config on the descriptor but the runtime does NOT auto-apply (consumer wires P#10 `withRateLimit` at the WS upgrade boundary today). v0.2 may bind automatically.
- **TheoCloud realtime provider preset** — consumer-supplied via `defineCopilotRealtimeProvider` works today; native preset v0.x.
- **Server-side persistence of conversation transcripts** — runtime emits `onResponse(copilotId, roomId, text)` callback; consumer wires their own store. SDK v1.7.0 conversation API integration v0.x.
- **`useCopilotAction` analog of CopilotKit** — the tool/readable model in v0.1 broadcasts register/deregister events; the copilot agent decides whether to consume. Full action-binding sugar v0.x.
- **dogfood-app smoke** — post-implementation session (post-G8 sdk@1.7.0 promote).
- **npm publish** — calendar-gated ~2026-07-15+ aligned with G8 sdk@1.7.0 + P#9 plugin-realtime@0.1.0 promote cohort.

### Security threats addressed

| Threat | Mitigation |
|---|---|
| Cost runaway via copilot-to-copilot loop | `TriggerEvaluator` filters `copilot:*` connectionId frames (EC-4). |
| Copilot impersonation by malicious human | `copilot:` connection-id prefix reserved; runtime never accepts `copilot:*` frame as trigger source (EC-8). |
| Per-request cost spike | Opt-in `budget.perRoom.perRequestUsd` preflight emits typed `budget-exceeded` frame instead of agent call. |
| Rolling cost overrun | `budget.perRoom.{dailyUsd, monthlyUsd}` rolling windows reset at UTC day/month boundaries. |
| Tool/knowledge registry injection | `useCopilotReadable` / `useCopilotTool` broadcast as events; copilot agent decides — no implicit trust. |
| Trigger ReDoS via malicious event names | Trigger event names matched via exact-string equality (no regex). |

### Quality gates

- **63 tests across 10 test files: 62 GREEN + 1 honest-SKIP (real-LLM env-gated by `OPENROUTER_API_KEY`).** With key: T4.2 real-LLM PASS at 1057ms against `openai/gpt-4o-mini` via OpenRouter (~$0.000032 USD per run).
  - Unit: types (5) + provider (3) + define-copilot (10) + agent-room-member (9) + budget-bridge (7) + voice-canvas-bridge (6) + trigger-evaluator (7) + runtime (11) = 58 tests.
  - Integration: copilot-room-multi-user (3) + copilot-real-llm (1 + 1 honest-SKIP-pair) = 5 tests.
- `npx tsc --noEmit`: exit 0.
- `npx tsup`: dual entry — `dist/index.js` + `dist/react/index.js` + `dist/index.d.ts` + `dist/react/index.d.ts` + sourcemaps.
- `npm pack --dry-run`: validates tarball (zero test-file leak).
- Zero stubs / Mock / Stub / Fake exports in `src/` (per `no-stubs-no-mocks-no-wired.md`).

### Deferred (calendar-gated ~2026-07-15+)

- **dogfood-app smoke test** — wire `CopilotRuntime` + `<CopilotChat>` in dogfood-app once P#9 + sdk@1.7.0 are promoted to `@latest`. Chrome MCP visual roundtrip with real LLM.
- **npm publish** via `pnpm publish --tag next --access public`.
- **Real OpenRouter CI smoke** — `OPENROUTER_API_KEY` env-gated workflow with cost cap.
