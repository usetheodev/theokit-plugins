---
"@theokit/plugin-copilot": patch
---

Prune per-room round-robin dispatcher state when a room empties (review finding F-arch-2). `roundRobinCursor` and `roundRobinDecision` are keyed by room id and were never deleted, growing unbounded across long-running processes that cycle through many transient rooms. `unregisterCopilot` now deletes both maps' entries for a room — but only when `copilotsInRoom` is empty after the removal, so a room with remaining copilots keeps its fair-rotation state. No public API change.
