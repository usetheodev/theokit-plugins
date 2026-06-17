---
"@theokit/plugin-voice": patch
---

Stop reflecting raw upstream provider error bodies to the client in the STT/TTS handlers (#214). On an upstream error, the body is now logged server-side under a generated correlation id and the client receives a generic `UPSTREAM_ERROR` message carrying the same id (status code unchanged: 5xx→502, 4xx passed through). This prevents leaking provider internals while keeping the failure debuggable via the shared reference id. No public API change.
