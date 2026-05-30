/**
 * Smoke tests for the public surface of @usetheo/plugin-voice.
 *
 * Covers:
 *   - error hierarchy exports the right classes with stable names
 *   - voicePlugin() validates synchronously (EC-6) and returns a
 *     no-op TheoPlugin shape
 *   - resolveVoiceConfig() returns the resolved config WITHOUT
 *     registering a plugin (useful for tests + custom wiring)
 */
import { describe, expect, it } from 'vitest'

import voicePlugin, {
  VoiceNoDeviceError,
  VoicePermissionDeniedError,
  VoicePluginConfigError,
  VoicePluginError,
  VoiceProviderError,
  resolveVoiceConfig,
  handleSttRequest,
  handleTtsRequest,
} from '../src/index.js'

const apiKeyOpts = {
  stt: { apiKey: 'sk-test-stt' },
  tts: { apiKey: 'sk-test-tts' },
}

describe('plugin-voice public surface', () => {
  describe('error hierarchy', () => {
    it('exports VoicePluginError as the common base', () => {
      expect(new VoicePermissionDeniedError('x')).toBeInstanceOf(VoicePluginError)
      expect(new VoiceNoDeviceError('x')).toBeInstanceOf(VoicePluginError)
      expect(new VoicePluginConfigError('x')).toBeInstanceOf(VoicePluginError)
      expect(new VoiceProviderError('openai', 401, 'x')).toBeInstanceOf(VoicePluginError)
    })

    it('preserves the name field for each subclass', () => {
      expect(new VoicePermissionDeniedError('x').name).toBe('VoicePermissionDeniedError')
      expect(new VoiceNoDeviceError('x').name).toBe('VoiceNoDeviceError')
      expect(new VoicePluginConfigError('x').name).toBe('VoicePluginConfigError')
      expect(new VoiceProviderError('openai', 401, 'x').name).toBe('VoiceProviderError')
    })

    it('VoiceProviderError carries provider + status', () => {
      const err = new VoiceProviderError('openai', 429, 'rate limited')
      expect(err.provider).toBe('openai')
      expect(err.status).toBe(429)
    })

    it('preserves Error cause chain', () => {
      const cause = new Error('underlying')
      const err = new VoicePluginError('wrapper', { cause })
      expect(err.cause).toBe(cause)
    })
  })

  describe('EC-6 — synchronous config validation', () => {
    it('throws VoicePluginConfigError when STT key is missing', () => {
      const prev = process.env.OPENAI_API_KEY
      delete process.env.OPENAI_API_KEY
      try {
        expect(() => voicePlugin()).toThrowError(VoicePluginConfigError)
        expect(() => voicePlugin()).toThrowError(/OPENAI_API_KEY/)
      } finally {
        if (prev !== undefined) process.env.OPENAI_API_KEY = prev
      }
    })

    it('throws when stt.provider="groq" but GROQ_API_KEY is missing', () => {
      const prev = process.env.GROQ_API_KEY
      delete process.env.GROQ_API_KEY
      try {
        expect(() =>
          voicePlugin({ stt: { provider: 'groq' }, tts: { apiKey: 'sk-tts' } }),
        ).toThrowError(/GROQ_API_KEY/)
      } finally {
        if (prev !== undefined) process.env.GROQ_API_KEY = prev
      }
    })

    it('succeeds when both keys are passed explicitly via opts (no env)', () => {
      const prev = process.env.OPENAI_API_KEY
      delete process.env.OPENAI_API_KEY
      try {
        const plugin = voicePlugin(apiKeyOpts)
        expect(plugin.name).toBe('@usetheo/plugin-voice')
      } finally {
        if (prev !== undefined) process.env.OPENAI_API_KEY = prev
      }
    })

    it('reads from a custom envVar when provided', () => {
      const prev = process.env.MY_KEY
      process.env.MY_KEY = 'sk-from-custom-env'
      try {
        const plugin = voicePlugin({
          stt: { envVar: 'MY_KEY' },
          tts: { envVar: 'MY_KEY' },
        })
        expect(plugin.name).toBe('@usetheo/plugin-voice')
      } finally {
        if (prev === undefined) delete process.env.MY_KEY
        else process.env.MY_KEY = prev
      }
    })

    it('rejects empty endpoint paths', () => {
      expect(() =>
        voicePlugin({ ...apiKeyOpts, stt: { ...apiKeyOpts.stt, endpoint: '' } }),
      ).toThrowError()
    })

    it('rejects endpoints that do not start with /', () => {
      expect(() =>
        voicePlugin({ ...apiKeyOpts, stt: { ...apiKeyOpts.stt, endpoint: 'voice/stt' } }),
      ).toThrowError(/endpoint must start with \//)
    })
  })

  describe('resolveVoiceConfig', () => {
    it('returns a fully resolved config (without registering a plugin)', () => {
      const config = resolveVoiceConfig(apiKeyOpts)
      expect(config.stt.provider).toBe('openai')
      expect(config.stt.model).toBe('whisper-1')
      expect(config.stt.endpoint).toBe('/api/voice/stt')
      expect(config.tts.model).toBe('tts-1')
      expect(config.tts.voice).toBe('alloy')
    })

    it('propagates the same VoicePluginConfigError as voicePlugin()', () => {
      const prev = process.env.OPENAI_API_KEY
      delete process.env.OPENAI_API_KEY
      try {
        expect(() => resolveVoiceConfig()).toThrowError(VoicePluginConfigError)
      } finally {
        if (prev !== undefined) process.env.OPENAI_API_KEY = prev
      }
    })
  })

  describe('handler exports', () => {
    it('handleSttRequest is a function with (request, config, opts) arity', () => {
      expect(typeof handleSttRequest).toBe('function')
      expect(handleSttRequest.length).toBeGreaterThanOrEqual(2)
    })

    it('handleTtsRequest is a function with (request, config, opts) arity', () => {
      expect(typeof handleTtsRequest).toBe('function')
      expect(handleTtsRequest.length).toBeGreaterThanOrEqual(2)
    })
  })
})
