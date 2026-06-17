# Phase 2 — Completeness Findings (promise vs implementation)

## 1. [HIGH] processWebhook marks event processed BEFORE handler runs — failed handlers are never retried (breaks documented exactly-once)

- **Location:** `packages/plugin-payments/src/webhook.ts:191`
- **Detail:** README "Security threats addressed" promises "Idempotency table guarantees each event.id runs exactly once" and that Stripe 5xx retries are honored (README:93,164,168). But processWebhook calls store.markProcessed(event.id) at webhook.ts:191 BEFORE registry.dispatch at :196. When a handler throws, the function returns handler_error (500) AND the event is already recorded as processed. Stripe retries on 5xx, but the retry hits isNew===false (:192) and returns {status:ok,duplicate:true} WITHOUT re-running the handler. Result is at-most-once, not exactly-once: a transient handler failure permanently loses the event. This is a money/auth-boundary correctness gap.

## 2. [HIGH] db reset verb documented to require --force but baseArgs never adds or checks --force (destructive guard not implemented)

- **Location:** `packages/plugin-db-drizzle/src/cli/db.ts:74`
- **Detail:** README:59 (`theokit db reset --force  # Drop tables...`) and SUMMARIES (db.ts:64-65, "Requires --force") document a destructive-operation safety gate for reset. The args builder baseArgs (db.ts:74-84) returns only [verb,"--schema",schemaPath] for every verb and special-cases ONLY generate (adds --out). For reset it neither appends --force nor guards on its presence, so the documented confirmation gate for a drop-tables operation does not exist in the code that builds the command.

## 3. [HIGH] plugin-copilot: CopilotProvider documented props (localConnectionId, runtime) do not exist in the component API

- **Location:** `packages/plugin-copilot/src/react/copilot-provider.tsx:26`
- **Detail:** README Quick start (README.md:127-134) renders <CopilotProvider roomId copilotId provider localConnectionId="alice" runtime={runtime}>. The actual CopilotProviderProps (copilot-provider.tsx:26-41) declares userConnectionId (NOT localConnectionId) and has NO runtime prop at all (it accepts copilotId, roomId, provider, userConnectionId, messageCap?, usage?). A consumer copy-pasting the documented Quick start passes an unknown localConnectionId/runtime and omits the required userConnectionId, so sendBroadcast attribution is undefined and the example will not type-check / behave as written. The headline differentiator (copilot as a presence-visible RoomMember) is reached through this provider, so the primary integration path is mis-documented.

## 4. [MEDIUM] db CLI verbs drop documented driver/url connection options — baseArgs never passes them to drizzle-kit

- **Location:** `packages/plugin-db-drizzle/src/cli/db.ts:75`
- **Detail:** README "Options reference" documents driver and url as the DB connection config and states all verbs "shell out to drizzle-kit" (README:44-49,64). resolveOptions wires driver+url into plugin.options (options.ts:64-71) but baseArgs (db.ts:75) only emits [verb,"--schema",schemaPath] (+--out for generate). driver/url/dialect are never added to the args for migrate/push/studio/check, which require connection info. The documented options are accepted and surfaced but not forwarded to the CLI invocation.

## 5. [MEDIUM] db seed verb builds a nonexistent drizzle-kit subcommand instead of running the documented user seed script

- **Location:** `packages/plugin-db-drizzle/src/cli/db.ts:78`
- **Detail:** README:61 + SUMMARIES (db.ts:66) say seed "Run the user-provided seed script (package.json#theokit.db.seed)". The module header (db.ts:7-8) states every verb spawns drizzle-kit. But baseArgs("seed",...) produces ["seed","--schema",...] — drizzle-kit has no `seed` subcommand, so this would invoke an unknown drizzle-kit command rather than the user seed script the README promises. The documented seed behavior is not implemented by the args builder.

## 6. [MEDIUM] plugin-copilot: documented useCopilotReadable/useCopilotTool call signatures do not match implementation

- **Location:** `packages/plugin-copilot/src/react/hooks.ts:59`
- **Detail:** README (README.md:155-156) documents useCopilotReadable("currentPage", { url: "/dashboard" }) (positional key,value) and useCopilotTool({ name: "create-task", schema: { } }). The implementation (hooks.ts:59 and hooks.ts:78) requires object args: useCopilotReadable<T>({ description, value }) and useCopilotTool({ name, description, handler, authorize? }) — there is no positional key arg and no schema field; description and (for tools) handler are required. Following the README produces a runtime no-op / wrong broadcast payload (opts.description is undefined) and TypeScript errors.

## 7. [MEDIUM] plugin-copilot: budget charges a fixed estimate, not actual usage (README promises actual-cost accounting)

- **Location:** `packages/plugin-copilot/src/internal/runtime.ts:261`
- **Detail:** README § Budget integration states getUsage returns {dailyUsedUsd, monthlyUsedUsd} for usage-meter integration and BudgetBridge.charge() is documented as Charge actual cost after agent invocation completes (budget-bridge.ts:91-92). But runtime.runAgent() (runtime.ts:261) calls reg.budget.charge(..., this.estimatedCostPerInvocationUsd) — it charges the fixed pre-flight ESTIMATE, never the actual token cost from the agent result. dailyUsedUsd/monthlyUsedUsd therefore drift from real spend, weakening the documented rolling daily/monthly cost-overrun guard (the per-request guard still fires on the estimate). Note budget-bridge.ts:8-9 acknowledges v0.1 is a simplified in-memory tracker, so this is a documented-vs-actual accounting gap rather than a missing feature.

## 8. [LOW] db CLI EC-4 conflict guard is a no-op — both hasCliCommand branches call registerCliCommand identically

- **Location:** `packages/plugin-db-drizzle/src/index.ts:61`
- **Detail:** index.ts:61-69 documents an EC-4 conflict guard that should EXTEND an existing `db` namespace registered by orm rather than replace it. Both the if (hasCliCommand("db")) branch and the else branch execute the identical statement app.registerCliCommand("db", commands). The guard therefore has no behavioral effect; whether orm already registered `db` or not, the same call is made. The documented merge-vs-create distinction is not implemented.

## 9. [LOW] plugin-voice: index.ts docstring describes handler signature that no longer matches the code

- **Location:** `packages/plugin-voice/src/index.ts:7`
- **Detail:** The module docstring (index.ts:7-9) states the handlers are handleSttRequest(request: Request, config) / handleTtsRequest(request: Request, config). The actual exported signatures take a pre-parsed input first arg: handleSttRequest(input: SttInput, config, opts?) (stt-server.ts:67) and handleTtsRequest(input: TtsInput, config, opts?) (tts-server.ts:43). The README endpoints table is correct; only the in-source docstring is stale, which could mislead a contributor wiring the defineRoute shim.

## Component verdicts (meetings)

- None — None
- None — None
- None — None
- None — None
- None — None
- None — None
- None — None
- None — None
- None — None
