---
"@theokit/plugin-voice": patch
---

Wire `<VoiceRecorderBar>`'s `onError` into the recorder (review finding F-wire-1). The bar previously called `createRecorder()` with no arguments, so the `onError` option (added for in-recording errors) was never passed — a `MediaRecorder` error mid-recording released the stream but left the bar stuck in the recording state with the error lost. The bar now passes `{ onError }` to `createRecorder`; the `recorderFactory` prop is widened to receive the recorder options so injected factories see the same wiring. No breaking change (the zero-arg factory form remains assignable).
