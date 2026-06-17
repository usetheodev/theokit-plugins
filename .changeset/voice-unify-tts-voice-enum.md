---
"@theokit/plugin-voice": patch
---

Unify the TTS voice list into a single source of truth (#215). `options.ts` now exports `VALID_VOICES` and the `tts.voice` schema is `z.enum(VALID_VOICES)` (default `alloy`), so a misconfigured default voice is rejected at construction (and is now a compile-time type error) instead of slipping through `z.string()` and only failing as a 400 on the first request. `tts-server.ts` derives its per-request voice validation from the same `VALID_VOICES`, eliminating the schema/server divergence. The valid set is unchanged (the six OpenAI tts-1 voices).
