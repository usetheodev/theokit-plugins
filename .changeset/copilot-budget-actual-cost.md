---
"@theokit/plugin-copilot": patch
---

Charge actual usage instead of a fixed estimate (#174). The agent `complete` event may now carry `usage.costUsd`; when present, the runtime reconciles the budget reservation to that actual cost so `getUsage()` reflects real spend rather than the flat `estimatedCostPerInvocationUsd`. When the provider reports no cost, the estimate is used as the documented fallback. The `CopilotAgentLike` complete-event type gains an optional `usage` field (additive, backward-compatible).
