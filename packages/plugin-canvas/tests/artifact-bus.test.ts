/**
 * T3.1 — `createArtifactBus()` tests.
 *
 * 7 cases including EC-2 (handler isolation): a throwing handler MUST
 * NOT block other handlers from receiving the emit.
 */
import { describe, expect, it, vi } from 'vitest'

import { createArtifactBus } from '../src/server/index.js'
import type { Artifact } from '../src/schema.js'

const sampleArtifact: Artifact = {
  id: 'a-1',
  title: 'T',
  version: 1,
  createdAt: '2026-05-30T00:00:00Z',
  kind: 'markdown',
  content: '# hi',
}

describe('createArtifactBus', () => {
  it('emit delivers the artifact to a subscriber', () => {
    const bus = createArtifactBus()
    const handler = vi.fn()
    bus.subscribe('c-1', handler)
    bus.emit('c-1', sampleArtifact)
    expect(handler).toHaveBeenCalledOnce()
    expect(handler).toHaveBeenCalledWith(sampleArtifact)
  })

  it('subscribe returns an unsubscribe fn that removes the handler', () => {
    const bus = createArtifactBus()
    const handler = vi.fn()
    const unsub = bus.subscribe('c-1', handler)
    unsub()
    bus.emit('c-1', sampleArtifact)
    expect(handler).not.toHaveBeenCalled()
  })

  it('multiple subscribers for the same conversation all receive emit', () => {
    const bus = createArtifactBus()
    const h1 = vi.fn()
    const h2 = vi.fn()
    bus.subscribe('c-1', h1)
    bus.subscribe('c-1', h2)
    bus.emit('c-1', sampleArtifact)
    expect(h1).toHaveBeenCalledOnce()
    expect(h2).toHaveBeenCalledOnce()
  })

  it('emit to unknown conversation id is a no-op (no throw)', () => {
    const bus = createArtifactBus()
    expect(() => bus.emit('never-subscribed', sampleArtifact)).not.toThrow()
  })

  it('listConversations returns keys of conversations with handlers', () => {
    const bus = createArtifactBus()
    bus.subscribe('c-1', () => undefined)
    bus.subscribe('c-2', () => undefined)
    expect(bus.listConversations().sort()).toEqual(['c-1', 'c-2'])
  })

  it('dispose clears all subscriptions and allows re-subscribe afterwards', () => {
    const bus = createArtifactBus()
    const before = vi.fn()
    bus.subscribe('c-1', before)
    bus.dispose()
    bus.emit('c-1', sampleArtifact)
    expect(before).not.toHaveBeenCalled()
    const after = vi.fn()
    bus.subscribe('c-1', after)
    bus.emit('c-1', sampleArtifact)
    expect(after).toHaveBeenCalledOnce()
  })

  // EC-2 (canvas-ecosystem-refactor)
  it('isolates handler throws — sub1 throws, sub2 still receives emit', () => {
    const bus = createArtifactBus()
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const thrower = vi.fn(() => {
      throw new Error('boom')
    })
    const survivor = vi.fn()
    bus.subscribe('c-1', thrower)
    bus.subscribe('c-1', survivor)
    expect(() => bus.emit('c-1', sampleArtifact)).not.toThrow()
    expect(thrower).toHaveBeenCalledOnce()
    expect(survivor).toHaveBeenCalledOnce()
    expect(errSpy).toHaveBeenCalled()
    errSpy.mockRestore()
  })
})
