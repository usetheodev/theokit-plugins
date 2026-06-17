---
"@theokit/plugin-realtime": patch
---

Fix a check-then-act race in the Yjs provider where concurrent `applyYjsUpdate`/`applyYjsAwareness` calls on a fresh room could each construct a `Y.Doc`, orphaning the first (and its `Awareness`) (#193). Doc creation is now memoized with a per-room single-flight promise so concurrent applies share exactly one `Y.Doc`; if init fails, the memo is cleared so a later apply can recreate it (no permanently bricked room). The redundant second `loadYjs()` per apply is also removed — `ensureYjs` returns the loaded modules in its bundle (#196). No public API change.
