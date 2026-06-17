---
"@theokit/plugin-voice": patch
---

Recorder errors during recording no longer leak the media stream or get swallowed (#213). When `MediaRecorder` fires an `error` event with no `stop()` pending, `createRecorder` now always calls `releaseStream()` (stopping the mic tracks) and surfaces the typed error through a new optional `onError` callback. Errors during `stop()` still reject the `stop()` promise as before. The `onError` option is additive; the `Recorder` interface is unchanged.
