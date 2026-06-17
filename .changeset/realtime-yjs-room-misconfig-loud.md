---
"@theokit/plugin-realtime": patch
---

Fail loudly when a room declares `storage: "yjs"` but is wired to a provider without Yjs support (#197). Dispatching a Yjs update/awareness frame to such a room now throws `RealtimeError` (`yjs_provider_unsupported`) instead of silently dropping the frame and losing CRDT document state — the misconfiguration surfaces immediately. Rooms that do not declare `storage: "yjs"` are unaffected: a stray Yjs frame remains a no-op. No public API change.
