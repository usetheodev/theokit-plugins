# @usetheo/plugin-voice

Voice (Speech-to-Text + Text-to-Speech) plugin for [TheoKit](https://github.com/usetheodev/theokit).

> **Status:** 0.1.0 — scaffold only. STT handler ships in 0.2.0 (T3.2), TTS in 0.3.0 (T3.3), UI components in 0.4.0 (T3.4). See [theokit-ui-parity-plan.md](https://github.com/usetheodev/theokit-tools/blob/main/.claude/knowledge-base/plans/theokit-ui-parity-plan.md) Phase 3.

## Why this plugin

- Same single-config pattern as [`@theokit/plugin-cors`](../plugin-cors/) — install it, register it once in `theo.config.ts`, get `/api/voice/stt` + `/api/voice/tts` HTTP endpoints automatically. Zero extra files in `server/routes/`.
- Browser-side `MediaRecorder` helper that throws typed errors instead of `DOMException` — so `<VoiceRecorderBar>` can render an actionable `<Alert kind="auth">` when the user denied the mic.
- Provider-agnostic STT (OpenAI Whisper or Groq Whisper) selected via env var.
- Synchronous config validation: missing `OPENAI_API_KEY` throws `VoicePluginConfigError` at boot, not on the first user click.

## Install

```sh
pnpm add @usetheo/plugin-voice
```

Peer dependencies:

| Peer | Required | Notes |
| --- | --- | --- |
| `theokit` | `>=0.1.0-alpha.5` | Server-side hook registration |
| `react` | `^18.0.0 || ^19.0.0` | Only for the `./ui` subpath |

## Configuration

```ts
// theo.config.ts
import { defineTheoConfig } from 'theokit/server'
import voicePlugin from '@usetheo/plugin-voice'

export default defineTheoConfig({
  plugins: [
    voicePlugin({
      stt: { provider: 'openai' }, // reads OPENAI_API_KEY from env
      tts: { provider: 'openai', voice: 'alloy' },
    }),
  ],
})
```

### Environment variables

| Variable | Required | Default for |
| --- | --- | --- |
| `OPENAI_API_KEY` | yes (default STT + TTS provider) | `stt.provider: "openai"` AND `tts.provider: "openai"` |
| `GROQ_API_KEY` | only if you set `stt.provider: "groq"` | Groq Whisper (no TTS — fall back to OpenAI) |

You can override the env var name with `stt.envVar` / `tts.envVar`, or pass `stt.apiKey` / `tts.apiKey` explicitly in code.

### Endpoints

| Method | Path (default) | Body | Response |
| --- | --- | --- | --- |
| POST | `/api/voice/stt` | `multipart/form-data` with field `audio` | `{ transcript, language?, durationMs }` |
| POST | `/api/voice/tts` | `application/json` `{ text, voice? }` | `audio/mpeg` stream |

Both paths are configurable via `stt.endpoint` / `tts.endpoint`. They must start with `/`.

## Browser usage

```tsx
// React 18/19 client component
'use client'
import { VoiceRecorderBar } from '@usetheo/plugin-voice/ui'
import { ChatComposer } from '@usetheo/ui'

export function ChatPage() {
  const [value, setValue] = useState('')
  return (
    <ChatComposer
      value={value}
      onValueChange={setValue}
      leadingActions={<VoiceRecorderBar onTranscript={(t) => setValue((v) => v + ' ' + t)} />}
    />
  )
}
```

> **Browser requirements (EC-15):** `MediaRecorder` + `navigator.mediaDevices.getUserMedia` only work in **secure contexts** (HTTPS or `localhost`). The recorder will throw `VoicePermissionDeniedError` on plain `http://` even after user grants permission — wrap your dev server with `mkcert` or run on `localhost`.

## Error hierarchy

All errors extend a base `VoicePluginError`. Catch the base class for generic handling, or the specific subclass for targeted UX:

```ts
import {
  VoicePluginError,
  VoicePermissionDeniedError,
  VoiceNoDeviceError,
  VoicePluginConfigError,
  VoiceProviderError,
} from '@usetheo/plugin-voice'

try {
  await recorder.start()
} catch (e) {
  if (e instanceof VoicePermissionDeniedError) showAuthAlert()
  else if (e instanceof VoiceNoDeviceError) showNoDeviceAlert()
  else throw e
}
```

| Class | When | Where it fires |
| --- | --- | --- |
| `VoicePermissionDeniedError` | User denied mic | Browser, `recorder.start()` |
| `VoiceNoDeviceError` | No mic device present | Browser, `recorder.start()` |
| `VoicePluginConfigError` | Missing API key | Server, `voicePlugin(opts)` construction |
| `VoiceProviderError` | STT/TTS provider returned non-2xx | Server, both endpoints |

## License

MIT — see [LICENSE](./LICENSE).
