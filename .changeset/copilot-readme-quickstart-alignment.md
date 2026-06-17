---
"@theokit/plugin-copilot": patch
---

Reconcile the README Quick start with the implemented, tested API (#172, #173). `CopilotProvider` is documented with `userConnectionId` (the real prop) instead of the non-existent `localConnectionId`/`runtime` props, and the headless hooks are shown with their real object-argument signatures (`useCopilotReadable({ description, value })`, `useCopilotTool({ name, description, handler })`) instead of the old positional / `{name, schema}` forms. A new test mirrors the documented Quick start so it compiles and runs against the real API, preventing future doc drift. Docs + test only — no code/API change.
