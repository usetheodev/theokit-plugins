---
"@theokit/plugin-copilot": patch
---

Fix the `round-robin` dispatcher so it rotates fairly across copilots in a room (#220). The cursor is now keyed by room id (not by `frame.connectionId`), and — because `_handleFrame` runs once per copilot — the dispatch decision is memoized per (room, frame) so the cursor advances exactly once per frame. Previously the cursor advanced once per copilot per frame, so every copilot selected itself and round-robin degraded to `all`; it was also keyed by connection, so connections never shared a rotation. Now exactly one copilot responds per frame, rotating across all copilots in the room regardless of which connection sent the frame. No public API change.
