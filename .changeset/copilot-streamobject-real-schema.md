---
"@theokit/plugin-copilot": patch
---

Pass a real validation schema to `Agent.streamObject` (#224). The runtime previously supplied a passthrough schema (`safeParse` always succeeded), disabling output validation. It now passes `z.object({ text: z.string() })`, so the agent rejects a non-conforming completion instead of silently coercing it. No public API change.
