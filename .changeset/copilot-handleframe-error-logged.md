---
"@theokit/plugin-copilot": patch
---

Log queued-task failures with copilot/room context instead of swallowing them in an empty catch (#222). The per-copilot queue's error handler now emits a structured `console.error` with `copilotId` + `roomId` + the error, keeping the chain alive while making frame/idle failures observable. No public API change.
