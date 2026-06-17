---
"@theokit/plugin-voice": patch
---

Bound the STT/TTS upstream provider calls with a timeout and wire client aborts (#211, #212). `handleSttRequest`/`handleTtsRequest` now accept `timeoutMs` (default 30s) and a `signal` on their options; the per-request timeout is composed with the caller's signal (`AbortSignal.any`) and passed to `fetch`, so a stalled upstream no longer hangs the handler — a timeout or client abort returns `504 UPSTREAM_TIMEOUT` (genuine network errors remain `502 UPSTREAM_NETWORK`). Passing the signal to the real `fetch` also cancels the TTS streamed `audio/mpeg` body when the client disconnects mid-stream. Both options are additive; handler signatures are unchanged.
