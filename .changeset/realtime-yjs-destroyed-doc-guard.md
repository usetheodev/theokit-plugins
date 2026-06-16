---
"@theokit/plugin-realtime": patch
---

Guard the Yjs provider against applying an update to a destroyed/garbage-collected `Y.Doc` (#194). In-flight `applyYjsUpdate`/`applyYjsAwareness` ops now hold a per-room refcount; `gcIfEmpty` defers both doc destruction and room eviction while the count is non-zero, so a concurrent `leaveRoom` can no longer destroy the doc mid-apply. An apply that still races room eviction is a safe no-op (post-await membership re-check) instead of touching a destroyed doc. This also closes the orphan where a room GC'd while its doc was still initializing leaked the `Y.Doc` (never destroyed). No public API change.
