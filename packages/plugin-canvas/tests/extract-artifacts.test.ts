/**
 * T4.5 — extractor for "Open in Canvas".
 */
import { describe, expect, it } from 'vitest'

import { extractArtifactCandidates } from '../src/ui/extract-artifacts.js'

const ctx = { messageId: 'msg-42' }

describe('extractArtifactCandidates', () => {
  it('returns a markdown candidate when nothing structured is present', () => {
    const out = extractArtifactCandidates('Just a plain reply with no code.', ctx)
    expect(out).toHaveLength(1)
    expect(out[0]?.label).toMatch(/markdown/i)
    expect(out[0]?.build().kind).toBe('markdown')
  })

  it('returns an empty list for an empty body', () => {
    expect(extractArtifactCandidates('', ctx)).toEqual([])
    expect(extractArtifactCandidates('   ', ctx)).toEqual([])
  })

  it('extracts a code block with language', () => {
    const out = extractArtifactCandidates('See:\n```ts\nconst x = 1\n```', ctx)
    expect(out).toHaveLength(1)
    const a = out[0]!.build()
    expect(a.kind).toBe('code')
    if (a.kind === 'code') {
      expect(a.language).toBe('ts')
      expect(a.content).toBe('const x = 1')
    }
  })

  it('extracts multiple code blocks', () => {
    const body = '```ts\nA\n```\nintro\n```py\nB\n```'
    const out = extractArtifactCandidates(body, ctx)
    expect(out).toHaveLength(2)
    expect(out[0]!.build().kind).toBe('code')
    expect(out[1]!.build().kind).toBe('code')
  })

  it('extracts a mermaid fence as a mermaid artifact', () => {
    const body = '```mermaid\ngraph TD;\n  A-->B\n```'
    const out = extractArtifactCandidates(body, ctx)
    expect(out).toHaveLength(1)
    expect(out[0]!.label).toMatch(/mermaid/i)
    expect(out[0]!.build().kind).toBe('mermaid')
  })

  it('extracts a fenceless inline SVG', () => {
    const body = 'Here is the icon: <svg width="10"><rect/></svg>'
    const out = extractArtifactCandidates(body, ctx)
    expect(out).toHaveLength(1)
    expect(out[0]!.build().kind).toBe('svg')
  })

  it('does not double-count an SVG that is already inside a code fence', () => {
    const body = '```\n<svg><rect/></svg>\n```'
    const out = extractArtifactCandidates(body, ctx)
    expect(out).toHaveLength(1)
    expect(out[0]!.build().kind).toBe('code')
  })

  it('assigns stable ids based on messageId + suffix', () => {
    const body = '```ts\nA\n```\n```py\nB\n```'
    const out = extractArtifactCandidates(body, ctx)
    expect(out[0]!.id).toBe('msg-42-fence-0')
    expect(out[1]!.id).toBe('msg-42-fence-1')
  })

  it('threads sessionId into the built envelope', () => {
    const body = '```ts\nA\n```'
    const out = extractArtifactCandidates(body, { messageId: 'm', sessionId: 's-7' })
    expect(out[0]!.build().sessionId).toBe('s-7')
  })

  it('untagged fence defaults language to "text"', () => {
    const body = '```\nplain\n```'
    const a = extractArtifactCandidates(body, ctx)[0]!.build()
    if (a.kind !== 'code') throw new Error('expected code')
    expect(a.language).toBe('text')
  })
})
