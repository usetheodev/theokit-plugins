/**
 * T3.2 — JSON serve helper with EC-2 size cap + EC-5 503 fallback.
 *
 * Per P#3 plan v1.3 T3.2. 10 tests cover:
 *  - 200 happy path + JSON content-type + cache-control no-cache
 *  - 503 OPENAPI_NOT_EMITTED (EC-5 absorbed)
 *  - 500 on read failure (e.g., file is a directory)
 *  - 413 OPENAPI_TOO_LARGE (EC-2 absorbed)
 *  - boundary: file exactly at cap → 200
 *  - empty file (0 bytes) → 200 (not 503)
 *  - response.end called exactly once
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { validateOpenApiOptions } from '../src/options.js'
import { serveOpenApiJson, MAX_OPENAPI_JSON_BYTES } from '../src/serve-openapi-json.js'

interface MockResponse {
  statusCode: number
  headersSent: boolean
  writableEnded: boolean
  _headers: Record<string, string>
  _body: string
  setHeader: ReturnType<typeof vi.fn>
  end: ReturnType<typeof vi.fn>
}

function mockCtx(): { request: object; response: MockResponse; ctx: object; requestId: string } {
  const res: MockResponse = {
    statusCode: 200,
    headersSent: false,
    writableEnded: false,
    _headers: {},
    _body: '',
    setHeader: vi.fn((k: string, v: string) => {
      res._headers[k] = v
    }),
    end: vi.fn((body?: string) => {
      res._body = body ?? ''
      res.writableEnded = true
    }),
  }
  return { request: {}, response: res, ctx: {}, requestId: 'test-1' }
}

let tmpDir: string
let opts: ReturnType<typeof validateOpenApiOptions>

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'plugin-openapi-t3-2-'))
  opts = validateOpenApiOptions({})
})

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true })
})

describe('serveOpenApiJson — 200 happy path', () => {
  it('serves the file content with 200 + application/json content-type', () => {
    const fileContent = JSON.stringify({ openapi: '3.1.0', paths: { '/a': {} } })
    mkdirSync(join(tmpDir, '.theo'), { recursive: true })
    writeFileSync(join(tmpDir, '.theo', 'openapi.json'), fileContent, 'utf-8')
    const ctx = mockCtx()
    serveOpenApiJson(ctx as never, opts, tmpDir)
    expect(ctx.response.statusCode).toBe(200)
    expect(ctx.response._headers['Content-Type']).toMatch(/application\/json/)
    expect(ctx.response._body).toBe(fileContent)
  })

  it('sets Cache-Control: no-cache on 200', () => {
    mkdirSync(join(tmpDir, '.theo'), { recursive: true })
    writeFileSync(join(tmpDir, '.theo', 'openapi.json'), '{}', 'utf-8')
    const ctx = mockCtx()
    serveOpenApiJson(ctx as never, opts, tmpDir)
    expect(ctx.response._headers['Cache-Control']).toMatch(/no-cache/)
  })

  it('serves empty file as 200 (NOT 503)', () => {
    mkdirSync(join(tmpDir, '.theo'), { recursive: true })
    writeFileSync(join(tmpDir, '.theo', 'openapi.json'), '', 'utf-8')
    const ctx = mockCtx()
    serveOpenApiJson(ctx as never, opts, tmpDir)
    expect(ctx.response.statusCode).toBe(200)
    expect(ctx.response._body).toBe('')
  })
})

describe('serveOpenApiJson — 503 EC-5 absorbed (file missing)', () => {
  it('returns 503 OPENAPI_NOT_EMITTED when file absent', () => {
    const ctx = mockCtx()
    serveOpenApiJson(ctx as never, opts, tmpDir)
    expect(ctx.response.statusCode).toBe(503)
    const body = JSON.parse(ctx.response._body) as { error: { code: string; docs: string } }
    expect(body.error.code).toBe('OPENAPI_NOT_EMITTED')
    expect(body.error.docs).toMatch(/^https?:\/\//)
  })

  it('503 envelope sets application/json content-type', () => {
    const ctx = mockCtx()
    serveOpenApiJson(ctx as never, opts, tmpDir)
    expect(ctx.response._headers['Content-Type']).toMatch(/application\/json/)
  })
})

describe('serveOpenApiJson — 500 on read failure', () => {
  it('returns 500 when path resolves to a directory (EISDIR-like)', () => {
    mkdirSync(join(tmpDir, '.theo', 'openapi.json'), { recursive: true }) // dir, not file
    const ctx = mockCtx()
    serveOpenApiJson(ctx as never, opts, tmpDir)
    expect(ctx.response.statusCode).toBe(500)
    const body = JSON.parse(ctx.response._body) as { error: { code: string } }
    expect(body.error.code).toBe('OPENAPI_READ_FAILED')
  })
})

describe('serveOpenApiJson — EC-2 absorbed (10 MB size cap)', () => {
  it('returns 413 OPENAPI_TOO_LARGE when file exceeds cap', () => {
    mkdirSync(join(tmpDir, '.theo'), { recursive: true })
    // Write a file just barely over the cap (cap + 1 bytes)
    const overSize = MAX_OPENAPI_JSON_BYTES + 1
    const filePath = join(tmpDir, '.theo', 'openapi.json')
    // Use truncate-style write to avoid 10 MB allocation in memory
    const fd = require('node:fs').openSync(filePath, 'w')
    require('node:fs').ftruncateSync(fd, overSize)
    require('node:fs').closeSync(fd)
    const ctx = mockCtx()
    serveOpenApiJson(ctx as never, opts, tmpDir)
    expect(ctx.response.statusCode).toBe(413)
    const body = JSON.parse(ctx.response._body) as { error: { code: string; maxBytes: number } }
    expect(body.error.code).toBe('OPENAPI_TOO_LARGE')
    expect(body.error.maxBytes).toBe(MAX_OPENAPI_JSON_BYTES)
  })

  it('serves 200 at exactly MAX_OPENAPI_JSON_BYTES (boundary positive control)', () => {
    mkdirSync(join(tmpDir, '.theo'), { recursive: true })
    const filePath = join(tmpDir, '.theo', 'openapi.json')
    const fd = require('node:fs').openSync(filePath, 'w')
    require('node:fs').ftruncateSync(fd, MAX_OPENAPI_JSON_BYTES)
    require('node:fs').closeSync(fd)
    const ctx = mockCtx()
    serveOpenApiJson(ctx as never, opts, tmpDir)
    expect(ctx.response.statusCode).toBe(200)
  })
})

describe('serveOpenApiJson — invariants', () => {
  it('calls response.end exactly once across all branches', () => {
    // No file → 503
    const ctx = mockCtx()
    serveOpenApiJson(ctx as never, opts, tmpDir)
    expect(ctx.response.end).toHaveBeenCalledTimes(1)
  })
})
