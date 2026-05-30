/**
 * Server-side TTS handler for @usetheo/plugin-voice.
 *
 * Accepts an already-parsed `TtsInput` (`{ text, voice? }`) and returns
 * a `Response` whose body streams `audio/mpeg` directly from OpenAI
 * tts-1. The caller is responsible for parsing the inbound JSON body —
 * theokit's `defineRoute` already does that, so the shim is a 12-line
 * adapter.
 *
 * Hard constraints:
 *   - OpenAI tts-1 max input length is 4096 characters → 400 INPUT_TOO_LONG.
 *   - Allowed voices come from the OpenAI tts-1 closed enum → 400 INVALID_VOICE.
 */

import { VoicePluginError } from './errors.js'
import type { VoiceConfig } from './options.js'

/** OpenAI tts-1 max input length per docs (2026-05). */
const MAX_TEXT_CHARS = 4096

/** OpenAI tts-1 closed voice enum. */
const VALID_VOICES = new Set(['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'])

const PROVIDER_URL: Record<VoiceConfig['tts']['provider'], string> = {
  openai: 'https://api.openai.com/v1/audio/speech',
}

export interface TtsInput {
  text: string
  voice?: string
  /**
   * Playback speed multiplier forwarded to OpenAI tts-1. Valid range is
   * [0.25, 4.0]; out-of-range values are rejected with 400 INVALID_SPEED.
   * Omit to use the default (1.0).
   */
  speed?: number
}

export interface TtsHandlerOptions {
  fetchImpl?: typeof fetch
}

export async function handleTtsRequest(
  input: TtsInput,
  config: VoiceConfig['tts'],
  opts: TtsHandlerOptions = {},
): Promise<Response> {
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch

  if (typeof input?.text !== 'string' || input.text.length === 0) {
    return jsonError(400, 'INVALID_BODY', '"text" is required and must be a non-empty string.')
  }
  if (input.text.length > MAX_TEXT_CHARS) {
    return jsonError(
      400,
      'INPUT_TOO_LONG',
      `"text" exceeds the ${MAX_TEXT_CHARS}-character limit imposed by OpenAI tts-1. Split the input client-side.`,
    )
  }

  const voice = input.voice ?? config.voice
  if (!VALID_VOICES.has(voice)) {
    return jsonError(
      400,
      'INVALID_VOICE',
      `"${voice}" is not an OpenAI tts-1 voice. Allowed: ${Array.from(VALID_VOICES).sort().join(', ')}.`,
    )
  }

  if (input.speed !== undefined) {
    if (typeof input.speed !== 'number' || !Number.isFinite(input.speed)) {
      return jsonError(400, 'INVALID_SPEED', '"speed" must be a finite number.')
    }
    if (input.speed < 0.25 || input.speed > 4.0) {
      return jsonError(
        400,
        'INVALID_SPEED',
        `"speed" ${input.speed} is outside the OpenAI tts-1 range [0.25, 4.0].`,
      )
    }
  }

  const url = PROVIDER_URL[config.provider]
  const upstreamPayload: Record<string, unknown> = {
    model: config.model,
    voice,
    input: input.text,
    response_format: 'mp3',
  }
  if (input.speed !== undefined && input.speed !== 1) {
    upstreamPayload.speed = input.speed
  }

  let upstream: Response
  try {
    upstream = await fetchImpl(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(upstreamPayload),
    })
  } catch (err) {
    const wrapped = new VoicePluginError(
      `Network failure calling ${config.provider} TTS: ${err instanceof Error ? err.message : 'unknown'}`,
      { cause: err },
    )
    return jsonError(502, 'UPSTREAM_NETWORK', wrapped.message)
  }

  if (!upstream.ok) {
    const text = await upstream.text().catch(() => '')
    return jsonError(
      upstream.status >= 500 ? 502 : upstream.status,
      'UPSTREAM_ERROR',
      `Upstream ${config.provider} returned ${upstream.status}: ${truncate(text, 500)}`,
    )
  }

  if (upstream.body === null) {
    return jsonError(502, 'UPSTREAM_EMPTY', `${config.provider} returned an empty audio body.`)
  }

  const responseHeaders: Record<string, string> = {
    'Content-Type': 'audio/mpeg',
    'Cache-Control': 'no-store',
    'X-Voice-Provider': config.provider,
    'X-Voice-Model': config.model,
    'X-Voice-Voice': voice,
  }
  if (input.speed !== undefined) responseHeaders['X-Voice-Speed'] = String(input.speed)

  return new Response(upstream.body, {
    status: 200,
    headers: responseHeaders,
  })
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
