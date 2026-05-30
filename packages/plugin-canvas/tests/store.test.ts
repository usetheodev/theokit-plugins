/**
 * T4.7 — in-memory artifact store. The SQLite variant is exercised in
 * the dogfood integration (better-sqlite3 is not a plugin-canvas dev
 * dep — keeping the plugin tests dep-free).
 */
import { describe, expect, it } from 'vitest'

import {
  CanvasArtifactNotFoundError,
  CanvasPluginError,
  createInMemoryArtifactStore,
} from '../src/index.js'
import type { Artifact } from '../src/schema.js'

const env = {
  id: 'a1',
  title: 'T',
  createdAt: '2026-05-29T00:00:00Z',
}

const md = (overrides: Partial<Artifact> = {}): Artifact =>
  ({
    ...env,
    version: 1,
    kind: 'markdown',
    content: '#',
    ...overrides,
  }) as Artifact

describe('createInMemoryArtifactStore', () => {
  it('insert + get returns the row', async () => {
    const store = createInMemoryArtifactStore()
    const a = md()
    await store.insert(a)
    const got = await store.get('a1')
    expect(got?.id).toBe('a1')
  })

  it('get latest returns highest version', async () => {
    const store = createInMemoryArtifactStore()
    await store.insert(md({ version: 1 }))
    await store.insert(md({ version: 3 }))
    await store.insert(md({ version: 2 }))
    expect((await store.get('a1'))?.version).toBe(3)
  })

  it('get(id, version) returns that exact row', async () => {
    const store = createInMemoryArtifactStore()
    await store.insert(md({ version: 1, content: 'v1' }))
    await store.insert(md({ version: 2, content: 'v2' }))
    const got = await store.get('a1', 1)
    if (got?.kind === 'markdown') expect(got.content).toBe('v1')
  })

  it('getVersions returns ascending versions', async () => {
    const store = createInMemoryArtifactStore()
    await store.insert(md({ version: 2 }))
    await store.insert(md({ version: 1 }))
    await store.insert(md({ version: 3 }))
    const versions = await store.getVersions('a1')
    expect(versions.map((v) => v.version)).toEqual([1, 2, 3])
  })

  it('nextVersion returns 1 when empty, max+1 otherwise', async () => {
    const store = createInMemoryArtifactStore()
    expect(await store.nextVersion('a1')).toBe(1)
    await store.insert(md({ version: 1 }))
    await store.insert(md({ version: 4 }))
    expect(await store.nextVersion('a1')).toBe(5)
  })

  it('duplicate (id, version) insert throws', async () => {
    const store = createInMemoryArtifactStore()
    await store.insert(md({ version: 1 }))
    await expect(store.insert(md({ version: 1 }))).rejects.toBeInstanceOf(CanvasPluginError)
  })

  it('list with default filter returns latest per id', async () => {
    const store = createInMemoryArtifactStore()
    await store.insert(md({ id: 'a', version: 1 }))
    await store.insert(md({ id: 'a', version: 2 }))
    await store.insert(md({ id: 'b', version: 1 }))
    const rows = await store.list()
    expect(rows).toHaveLength(2)
    expect(rows.find((r) => r.id === 'a')?.version).toBe(2)
  })

  it('list mode=all returns every version', async () => {
    const store = createInMemoryArtifactStore()
    await store.insert(md({ id: 'a', version: 1 }))
    await store.insert(md({ id: 'a', version: 2 }))
    const rows = await store.list({ mode: 'all' })
    expect(rows).toHaveLength(2)
  })

  it('list filters by sessionId', async () => {
    const store = createInMemoryArtifactStore()
    await store.insert(md({ id: 'a', sessionId: 's1' }))
    await store.insert(md({ id: 'b', sessionId: 's2' }))
    const rows = await store.list({ sessionId: 's1' })
    expect(rows).toHaveLength(1)
    expect(rows[0]?.id).toBe('a')
  })

  it('list filters by kind', async () => {
    const store = createInMemoryArtifactStore()
    await store.insert(md({ id: 'a', kind: 'markdown', content: '#' }))
    await store.insert(
      md({
        id: 'b',
        kind: 'code',
        language: 'ts',
        content: 'x',
      } as unknown as Artifact),
    )
    const rows = await store.list({ kind: 'code' })
    expect(rows).toHaveLength(1)
    expect(rows[0]?.id).toBe('b')
  })

  it('list pagination via offset + limit', async () => {
    const store = createInMemoryArtifactStore()
    for (let i = 0; i < 5; i++) {
      await store.insert(
        md({
          id: `a${i}`,
          createdAt: `2026-05-29T00:00:0${i}Z`,
        }),
      )
    }
    const rows = await store.list({ offset: 1, limit: 2 })
    expect(rows).toHaveLength(2)
  })

  it('delete(id, version) drops one row', async () => {
    const store = createInMemoryArtifactStore()
    await store.insert(md({ version: 1 }))
    await store.insert(md({ version: 2 }))
    await store.delete('a1', 1)
    const versions = await store.getVersions('a1')
    expect(versions.map((v) => v.version)).toEqual([2])
  })

  it('delete(id) drops all versions', async () => {
    const store = createInMemoryArtifactStore()
    await store.insert(md({ version: 1 }))
    await store.insert(md({ version: 2 }))
    await store.delete('a1')
    expect(await store.getVersions('a1')).toEqual([])
  })

  it('delete missing throws CanvasArtifactNotFoundError', async () => {
    const store = createInMemoryArtifactStore()
    await expect(store.delete('nope', 1)).rejects.toBeInstanceOf(CanvasArtifactNotFoundError)
  })

  it('delete missing id (no version) is a no-op', async () => {
    const store = createInMemoryArtifactStore()
    await expect(store.delete('nope')).resolves.toBeUndefined()
  })
})
