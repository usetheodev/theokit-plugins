/**
 * @vitest-environment jsdom
 *
 * Tests for `useTts` — POST the text, decode the audio blob, play, and
 * surface state transitions. The HTMLAudioElement is mocked because
 * jsdom does not implement playback; the test asserts the hook drives
 * the mock through the documented state machine.
 */
import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { VoicePluginError, VoiceProviderError } from '../src/errors.js'
import { useTts } from '../src/ui/use-tts.js'

interface FakeAudio {
  src: string
  play: ReturnType<typeof vi.fn>
  pause: ReturnType<typeof vi.fn>
  addEventListener: ReturnType<typeof vi.fn>
  __listeners: Map<string, Array<(...args: unknown[]) => void>>
  emit(event: string): void
}

function makeAudio(): FakeAudio {
  const listeners = new Map<string, Array<(...args: unknown[]) => void>>()
  const audio: FakeAudio = {
    src: '',
    play: vi.fn(async () => undefined),
    pause: vi.fn(),
    addEventListener: vi.fn((type: string, fn: (...args: unknown[]) => void) => {
      const arr = listeners.get(type) ?? []
      arr.push(fn)
      listeners.set(type, arr)
    }),
    __listeners: listeners,
    emit(event: string) {
      for (const fn of listeners.get(event) ?? []) fn()
    },
  }
  return audio
}

function mp3Response(headers: Record<string, string> = {}) {
  return new Response(new Uint8Array([0xff, 0xfb]), {
    status: 200,
    headers: { 'Content-Type': 'audio/mpeg', ...headers },
  })
}

describe('useTts', () => {
  it('starts in idle phase and no error', () => {
    const { result } = renderHook(() => useTts({ fetchImpl: vi.fn() }))
    expect(result.current.phase).toBe('idle')
    expect(result.current.error).toBeNull()
  })

  it('idle → requesting → playing on successful speak()', async () => {
    const fetchImpl = vi.fn(async () => mp3Response())
    const audio = makeAudio()
    const { result } = renderHook(() =>
      useTts({ fetchImpl, audioFactory: () => audio as unknown as HTMLAudioElement }),
    )

    let pending: Promise<void> | undefined
    await act(async () => {
      pending = result.current.speak('hello')
    })
    await waitFor(() => expect(result.current.phase).toBe('playing'))
    expect(audio.play).toHaveBeenCalled()
    expect(audio.src).toMatch(/^blob:/)

    await act(async () => {
      audio.emit('ended')
    })
    await waitFor(() => expect(result.current.phase).toBe('idle'))
    await pending
  })

  it('POSTs JSON {text, voice?, speed?} with CSRF default header', async () => {
    let capturedInit: RequestInit | null = null
    const fetchImpl = vi.fn(async (_url: string | URL, init: RequestInit) => {
      capturedInit = init
      return mp3Response()
    })
    const audio = makeAudio()
    const { result } = renderHook(() =>
      useTts({
        fetchImpl,
        audioFactory: () => audio as unknown as HTMLAudioElement,
        voice: 'nova',
        speed: 1.25,
      }),
    )
    await act(async () => {
      await result.current.speak('hi')
    })
    expect(capturedInit?.method).toBe('POST')
    const headers = (capturedInit?.headers ?? {}) as Record<string, string>
    expect(headers['X-Theo-Action']).toBe('1')
    expect(headers['Content-Type']).toBe('application/json')
    const body = JSON.parse(capturedInit?.body as string) as Record<string, unknown>
    expect(body.text).toBe('hi')
    expect(body.voice).toBe('nova')
    expect(body.speed).toBe(1.25)
  })

  it('per-call voice/speed override the hook defaults', async () => {
    let capturedBody: Record<string, unknown> = {}
    const fetchImpl = vi.fn(async (_url: string | URL, init: RequestInit) => {
      capturedBody = JSON.parse(init.body as string) as Record<string, unknown>
      return mp3Response()
    })
    const audio = makeAudio()
    const { result } = renderHook(() =>
      useTts({
        fetchImpl,
        audioFactory: () => audio as unknown as HTMLAudioElement,
        voice: 'alloy',
        speed: 1,
      }),
    )
    await act(async () => {
      await result.current.speak('hi', { voice: 'shimmer', speed: 1.5 })
    })
    expect(capturedBody.voice).toBe('shimmer')
    expect(capturedBody.speed).toBe(1.5)
  })

  it('non-2xx response transitions to error phase with VoiceProviderError', async () => {
    const fetchImpl = vi.fn(async () => new Response('Unauthorized', { status: 401 }))
    const audio = makeAudio()
    const onError = vi.fn()
    const { result } = renderHook(() =>
      useTts({
        fetchImpl,
        audioFactory: () => audio as unknown as HTMLAudioElement,
        onError,
      }),
    )
    await act(async () => {
      await result.current.speak('hi')
    })
    await waitFor(() => expect(result.current.phase).toBe('error'))
    expect(result.current.error).toBeInstanceOf(VoiceProviderError)
    expect((result.current.error as VoiceProviderError).status).toBe(401)
    expect(onError).toHaveBeenCalledOnce()
  })

  it('network rejection transitions to error phase with VoicePluginError', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('ECONNRESET')
    })
    const audio = makeAudio()
    const { result } = renderHook(() =>
      useTts({ fetchImpl, audioFactory: () => audio as unknown as HTMLAudioElement }),
    )
    await act(async () => {
      await result.current.speak('hi')
    })
    await waitFor(() => expect(result.current.phase).toBe('error'))
    expect(result.current.error).toBeInstanceOf(VoicePluginError)
  })

  it('stop() pauses + resets to idle', async () => {
    const fetchImpl = vi.fn(async () => mp3Response())
    const audio = makeAudio()
    const { result } = renderHook(() =>
      useTts({ fetchImpl, audioFactory: () => audio as unknown as HTMLAudioElement }),
    )
    await act(async () => {
      await result.current.speak('hi')
    })
    await waitFor(() => expect(result.current.phase).toBe('playing'))
    act(() => {
      result.current.stop()
    })
    expect(result.current.phase).toBe('idle')
    expect(audio.pause).toHaveBeenCalled()
  })

  it('speak("") is a no-op (does not call fetch)', async () => {
    const fetchImpl = vi.fn()
    const { result } = renderHook(() => useTts({ fetchImpl }))
    await act(async () => {
      await result.current.speak('')
    })
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(result.current.phase).toBe('idle')
  })

  it('audio "error" event transitions to error phase', async () => {
    const fetchImpl = vi.fn(async () => mp3Response())
    const audio = makeAudio()
    const { result } = renderHook(() =>
      useTts({ fetchImpl, audioFactory: () => audio as unknown as HTMLAudioElement }),
    )
    await act(async () => {
      await result.current.speak('hi')
    })
    await waitFor(() => expect(result.current.phase).toBe('playing'))
    await act(async () => {
      audio.emit('error')
    })
    expect(result.current.phase).toBe('error')
    expect(result.current.error).toBeInstanceOf(VoicePluginError)
  })

  it('omits CSRF header when csrfHeader is explicitly null', async () => {
    let capturedInit: RequestInit | null = null
    const fetchImpl = vi.fn(async (_url: string | URL, init: RequestInit) => {
      capturedInit = init
      return mp3Response()
    })
    const audio = makeAudio()
    const { result } = renderHook(() =>
      useTts({
        fetchImpl,
        audioFactory: () => audio as unknown as HTMLAudioElement,
        csrfHeader: null,
      }),
    )
    await act(async () => {
      await result.current.speak('hi')
    })
    const headers = (capturedInit?.headers ?? {}) as Record<string, string>
    expect(headers['X-Theo-Action']).toBeUndefined()
  })
})
