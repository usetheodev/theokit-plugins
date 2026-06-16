---
"@theokit/plugin-voice": patch
---

Fix a `useTts` playback race where a stale `speak()` whose `audio.play()` resolved late could override a newer `speak()`/`stop()` (#216). Each `speak()` now captures its own `AbortController` and, after every await, checks identity (`abortRef.current !== controller`) rather than only `signal.aborted`. When a call discovers it has been superseded after `play()` resolves, it tears down only its own audio element, blob URL, and event listeners — never the newer call's shared refs or phase. No public API change.
