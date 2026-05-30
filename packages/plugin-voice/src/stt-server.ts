/**
 * Server-side STT handler for @usetheo/plugin-voice.
 *
 * Accepts an already-parsed `SttInput` (audio blob/buffer + optional
 * language/prompt) and returns a `Response`. The caller is responsible
 * for getting the audio out of the inbound request — theokit's
 * `defineRoute` already parses multipart bodies, so the shim in
 * `server/routes/voice/stt.ts` is a 12-line adapter.
 *
 * Why we don't reconstruct a Web Standards `Request` from theokit's
 * `IncomingMessage` argument: theokit's `parseRequestBody` drains the
 * inbound stream BEFORE the handler runs, and wrapping the drained
 * stream via `Readable.toWeb()` puts undici's body tracker in a state
 * that later disturbs the returned `Response` (observed empirically in
 * the dogfood smoke spec — 500 "Response body object should not be
 * disturbed or locked"). Accepting a pre-parsed shape is both simpler
 * and uncoupled from any specific runtime.
 *
 * Hard constraints documented up-front:
 *   - Whisper REST has a hard 25 MB per-file limit (OpenAI docs).
 *     Enforced by `MAX_BODY_BYTES` so a pathological caller cannot
 *     exhaust the server's memory before this check.
 *
 * Provider abstraction (D11):
 *   - OpenAI Whisper REST: POST https://api.openai.com/v1/audio/transcriptions
 *   - Groq Whisper REST:  POST https://api.groq.com/openai/v1/audio/transcriptions
 *
 * Observability:
 *   - Every successful Response carries `X-Voice-Provider` and
 *     `X-Voice-Model` headers.
 *   - `durationMs` is the upstream provider's processing time.
 */

import { Buffer } from 'node:buffer'

import { VoiceProviderError } from './errors.js'
import type { VoiceConfig } from './options.js'

/** Hard upper bound — Whisper REST refuses anything larger. */
const MAX_BODY_BYTES = 25 * 1024 * 1024

const PROVIDER_URL: Record<VoiceConfig['stt']['provider'], string> = {
  openai: 'https://api.openai.com/v1/audio/transcriptions',
  groq: 'https://api.groq.com/openai/v1/audio/transcriptions',
}

export type SttAudio =
  | Blob
  | { buffer: Buffer | Uint8Array | ArrayBuffer; mimeType?: string; filename?: string }

export interface SttInput {
  audio: SttAudio
  language?: string
  prompt?: string
}

export interface SttHandlerOptions {
  fetchImpl?: typeof fetch
}

export interface SttResponseBody {
  transcript: string
  language?: string
  durationMs: number
}

export async function handleSttRequest(
  input: SttInput,
  config: VoiceConfig['stt'],
  opts: SttHandlerOptions = {},
): Promise<Response> {
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch

  const audioBlob = await toBlob(input.audio)
  if (audioBlob === null) {
    return jsonError(400, 'INVALID_AUDIO', 'Missing audio input.')
  }
  if (audioBlob.size === 0) {
    return jsonError(400, 'INVALID_AUDIO', 'Audio payload is empty.')
  }
  if (audioBlob.size > MAX_BODY_BYTES) {
    return jsonError(
      400,
      'INVALID_AUDIO',
      `Audio payload (${audioBlob.size} bytes) exceeds the ${Math.floor(MAX_BODY_BYTES / 1024 / 1024)} MB Whisper limit. Chunk the recording client-side.`,
    )
  }

  const filename = pickFilename(input.audio) ?? 'audio.webm'
  const upstreamForm = new FormData()
  upstreamForm.append('file', audioBlob, filename)
  upstreamForm.append('model', config.model)
  upstreamForm.append('response_format', 'json')
  if (input.language !== undefined && input.language.length > 0) {
    upstreamForm.append('language', input.language)
  }
  if (input.prompt !== undefined && input.prompt.length > 0) {
    upstreamForm.append('prompt', input.prompt)
  }

  const url = PROVIDER_URL[config.provider]
  const startedAt = Date.now()
  let upstream: Response
  try {
    upstream = await fetchImpl(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.apiKey}` },
      body: upstreamForm,
    })
  } catch (err) {
    const wrapped = new VoiceProviderError(
      config.provider,
      0,
      `Network failure calling ${config.provider} Whisper: ${err instanceof Error ? err.message : 'unknown'}`,
      { cause: err },
    )
    return jsonError(502, 'UPSTREAM_NETWORK', wrapped.message)
  }
  const durationMs = Date.now() - startedAt

  if (!upstream.ok) {
    const bodyText = await upstream.text().catch(() => '')
    return jsonError(
      upstream.status >= 500 ? 502 : upstream.status,
      'UPSTREAM_ERROR',
      `Upstream ${config.provider} returned ${upstream.status}: ${truncate(bodyText, 500)}`,
    )
  }

  let parsedJson: { text?: string; language?: string }
  try {
    parsedJson = (await upstream.json()) as { text?: string; language?: string }
  } catch (err) {
    return jsonError(
      502,
      'UPSTREAM_PARSE',
      `Upstream ${config.provider} returned invalid JSON: ${err instanceof Error ? err.message : 'unknown'}`,
    )
  }

  const body: SttResponseBody = {
    transcript: parsedJson.text ?? '',
    durationMs,
  }
  if (parsedJson.language !== undefined) body.language = parsedJson.language

  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'X-Voice-Provider': config.provider,
      'X-Voice-Model': config.model,
    },
  })
}

async function toBlob(audio: SttAudio): Promise<Blob | null> {
  if (audio === null || audio === undefined) return null
  if (audio instanceof Blob) return audio
  const obj = audio as { buffer: Buffer | Uint8Array | ArrayBuffer; mimeType?: string }
  if (obj.buffer === undefined || obj.buffer === null) return null
  // Copy into a fresh ArrayBuffer-backed Uint8Array. The TS lib for
  // Blob requires `BlobPart` (ArrayBuffer | TypedArray<ArrayBuffer>),
  // and `Uint8Array<ArrayBufferLike>` (Node Buffer subtype) does not
  // satisfy that constraint under TS 5.9. The slice() is cheap given
  // the 25 MB hard cap enforced upstream.
  const src: Uint8Array | ArrayBuffer = obj.buffer
  const ab = new ArrayBuffer(src.byteLength)
  new Uint8Array(ab).set(
    src instanceof ArrayBuffer ? new Uint8Array(src) : (src as Uint8Array),
  )
  return new Blob([ab], { type: obj.mimeType ?? 'audio/webm' })
}

function pickFilename(audio: SttAudio): string | undefined {
  if (audio instanceof Blob) {
    const name = (audio as Blob & { name?: string }).name
    return typeof name === 'string' && name.length > 0 ? name : undefined
  }
  const obj = audio as { filename?: string }
  return typeof obj.filename === 'string' && obj.filename.length > 0 ? obj.filename : undefined
}

function jsonError(status: number, code: string, message: string): Response {
  return new Response(JSON.stringify({ error: { code, message } }), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  })
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, n - 1)}…`
}
