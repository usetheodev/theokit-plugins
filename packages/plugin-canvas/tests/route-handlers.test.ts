/**
 * T4.7 — CRUD route handlers (Web Standards Request → Response).
 */
import { describe, expect, it, vi } from 'vitest'

import {
  createArtifactRouteHandlers,
  createInMemoryArtifactStore,
} from '../src/index.js'
import type { Artifact } from '../src/schema.js'

const env = {
  id: 'a1',
  title: 'T',
  version: 1,
  createdAt: '2026-05-29T00:00:00Z',
}

function md(overrides: Partial<Artifact> = {}): Artifact {
  return { ...env, kind: 'markdown', content: '#', ...overrides } as Artifact
}

function jsonRequest(method: string, url: string, body?: unknown): Request {
  return new Request(url, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('createArtifactRouteHandlers', () => {
  it('POST /artifacts creates + returns 201 { artifact }', async () => {
    const store = createInMemoryArtifactStore()
    const handlers = createArtifactRouteHandlers({ store })
    const res = await handlers.create(jsonRequest('POST', 'http://x/artifacts', md()))
    expect(res.status).toBe(201)
    const json = (await res.json()) as { artifact?: Artifact }
    expect(json.artifact?.id).toBe('a1')
  })

  it('POST accepts a wrapped { artifact } payload OR a bare artifact', async () => {
    const store = createInMemoryArtifactStore()
    const handlers = createArtifactRouteHandlers({ store })
    const res = await handlers.create(
      jsonRequest('POST', 'http://x/artifacts', { artifact: md({ id: 'wrapped' }) }),
    )
    expect(res.status).toBe(201)
    expect(((await res.json()) as { artifact: Artifact }).artifact.id).toBe('wrapped')
  })

  it('POST auto-bumps version when re-publishing the same id', async () => {
    const store = createInMemoryArtifactStore()
    const handlers = createArtifactRouteHandlers({ store })
    await handlers.create(jsonRequest('POST', 'http://x/artifacts', md({ version: 1 })))
    const second = await handlers.create(
      jsonRequest('POST', 'http://x/artifacts', md({ version: 1 })),
    )
    expect(second.status).toBe(201)
    const json = (await second.json()) as { artifact: Artifact }
    expect(json.artifact.version).toBe(2)
  })

  it('POST rejects invalid body with 400 INVALID_BODY', async () => {
    const store = createInMemoryArtifactStore()
    const handlers = createArtifactRouteHandlers({ store })
    const res = await handlers.create(
      new Request('http://x/artifacts', {
        method: 'POST',
        body: '{not json',
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    expect(res.status).toBe(400)
    expect(await res.text()).toMatch(/INVALID_BODY/)
  })

  it('POST rejects invalid artifact with 400 INVALID_ARTIFACT', async () => {
    const store = createInMemoryArtifactStore()
    const handlers = createArtifactRouteHandlers({ store })
    const res = await handlers.create(
      jsonRequest('POST', 'http://x/artifacts', { kind: 'markdown', content: 'x' }),
    )
    expect(res.status).toBe(400)
    expect(await res.text()).toMatch(/INVALID_ARTIFACT/)
  })

  it('POST fires onAfterInsert with the stored artifact', async () => {
    const store = createInMemoryArtifactStore()
    const onAfterInsert = vi.fn()
    const handlers = createArtifactRouteHandlers({ store, onAfterInsert })
    await handlers.create(jsonRequest('POST', 'http://x/artifacts', md()))
    expect(onAfterInsert).toHaveBeenCalledOnce()
    expect(onAfterInsert.mock.calls[0]?.[0].id).toBe('a1')
  })

  it('GET /artifacts/{id} returns latest version', async () => {
    const store = createInMemoryArtifactStore()
    await store.insert(md({ version: 1 }))
    await store.insert(md({ version: 2 }))
    const handlers = createArtifactRouteHandlers({ store })
    const res = await handlers.getOne(
      new Request('http://x/artifacts/a1', { method: 'GET' }),
      { id: 'a1' },
    )
    expect(res.status).toBe(200)
    const json = (await res.json()) as { artifact: Artifact }
    expect(json.artifact.version).toBe(2)
  })

  it('GET /artifacts/{id} returns 404 when missing', async () => {
    const store = createInMemoryArtifactStore()
    const handlers = createArtifactRouteHandlers({ store })
    const res = await handlers.getOne(new Request('http://x/artifacts/nope'), { id: 'nope' })
    expect(res.status).toBe(404)
  })

  it('GET versions returns the array', async () => {
    const store = createInMemoryArtifactStore()
    await store.insert(md({ version: 1 }))
    await store.insert(md({ version: 2 }))
    const handlers = createArtifactRouteHandlers({ store })
    const res = await handlers.getVersions(new Request('http://x/artifacts/a1/versions'), {
      id: 'a1',
    })
    expect(res.status).toBe(200)
    const json = (await res.json()) as { versions: Artifact[] }
    expect(json.versions.map((v) => v.version)).toEqual([1, 2])
  })

  it('GET /artifacts lists + supports filter query params', async () => {
    const store = createInMemoryArtifactStore()
    await store.insert(md({ id: 'a', sessionId: 's1' }))
    await store.insert(md({ id: 'b', sessionId: 's2' }))
    const handlers = createArtifactRouteHandlers({ store })
    const res = await handlers.list(
      new Request('http://x/artifacts?session=s1', { method: 'GET' }),
    )
    expect(res.status).toBe(200)
    const json = (await res.json()) as { artifacts: Artifact[] }
    expect(json.artifacts.map((a) => a.id)).toEqual(['a'])
  })

  it('DELETE /artifacts/{id} returns 204', async () => {
    const store = createInMemoryArtifactStore()
    await store.insert(md())
    const handlers = createArtifactRouteHandlers({ store })
    const res = await handlers.remove(new Request('http://x/artifacts/a1', { method: 'DELETE' }), {
      id: 'a1',
    })
    expect(res.status).toBe(204)
    expect(await store.get('a1')).toBeNull()
  })

  it('DELETE returns 404 when not found', async () => {
    const store = createInMemoryArtifactStore()
    const handlers = createArtifactRouteHandlers({ store })
    const res = await handlers.remove(new Request('http://x/artifacts/nope', { method: 'DELETE' }), {
      id: 'nope',
      version: 1,
    })
    expect(res.status).toBe(404)
  })
})
