---
"@theokit/plugin-voice": patch
---

Guard the STT success-response JSON parse in `<VoiceRecorderBar>` (#217). A `200` response whose body is not valid JSON previously threw an opaque `SyntaxError`; it now surfaces a specific `VoicePluginError` ("Invalid STT response…", with the parse error as `cause`) through the component's `onError` path. No public API change.
