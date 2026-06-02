/**
 * T3.3 — Plugin integration: real PluginRunner + mock req/res.
 *
 * Per P#3 plan v1.3 T3.3 + 3 absorbed edge cases:
 *  - EC-3: writableEnded guard at handler start
 *  - EC-6: trailing-slash does NOT match
 *  - EC-7: HEAD method passes through
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { PluginRunner } from 'theokit/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import openApiPlugin, { type OpenApiOptions } from '../src/index.js'

interface MockResponse {
  statusCode: number
  headersSent: boolean
  writableEnded: boolean
  _headers: Record<string, string>
  _body: string
  setHeader: ReturnType<typeof vi.fn>
  end: ReturnType<typeof vi.fn>
}

function mockCtx(method: string, url: string): {
  request: { method: string; url: string; headers: Record<string, string> }
  response: MockResponse
  ctx: Record<string, unknown>
  requestId: string
} {
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
  return { request: { method, url, headers: {} }, response: res, ctx: {}, requestId: 'test-1' }
}

let tmpCwd: string
let originalCwd: string

beforeEach(() => {
  tmpCwd = mkdtempSync(join(tmpdir(), 'plugin-openapi-integration-'))
  originalCwd = process.cwd()
  process.chdir(tmpCwd)
})

afterEach(() => {
  process.chdir(originalCwd)
  rmSync(tmpCwd, { recursive: true, force: true })
})

async function makeRunnerWith(opts: OpenApiOptions = {}): Promise<PluginRunner> {
  const runner = new PluginRunner()
  await runner.register(openApiPlugin(opts))
  return runner
}

describe('T3.3 — registration', () => {
  it('default export is a function returning a TheoPlugin', () => {
    const plugin = openApiPlugin()
    expect(typeof plugin.register).toBe('function')
    expect(plugin.name).toBe('@usetheo/plugin-openapi')
  })

  it('registers with PluginRunner without throwing', async () => {
    const runner = await makeRunnerWith()
    expect(runner.has('@usetheo/plugin-openapi')).toBe(true)
  })

  it('duplicate registration throws DuplicatePluginError', async () => {
    const runner = new PluginRunner()
    await runner.register(openApiPlugin())
    await expect(runner.register(openApiPlugin())).rejects.toThrow(/already registered/i)
  })
})

describe('T3.3 — GET /api/docs serves HTML', () => {
  it('returns 200 + text/html + Scalar embed', async () => {
    const runner = await makeRunnerWith()
    const ctx = mockCtx('GET', '/api/docs')
    await runner.runOnRequest(ctx as never)
    expect(ctx.response.statusCode).toBe(200)
    expect(ctx.response._headers['Content-Type']).toMatch(/text\/html/)
    expect(ctx.response._body).toMatch(/Scalar\.createApiReference/)
    expect(ctx.response._body).toMatch(/<!doctype html>/i)
  })

  it('respects custom docsPath', async () => {
    const runner = await makeRunnerWith({ docsPath: '/custom/docs' })
    const ctx = mockCtx('GET', '/custom/docs')
    await runner.runOnRequest(ctx as never)
    expect(ctx.response.statusCode).toBe(200)
    expect(ctx.response._headers['Content-Type']).toMatch(/text\/html/)
  })

  it('query string is stripped before path match', async () => {
    const runner = await makeRunnerWith()
    const ctx = mockCtx('GET', '/api/docs?theme=dark')
    await runner.runOnRequest(ctx as never)
    expect(ctx.response.statusCode).toBe(200)
  })

  it('embeds the openapiJsonPath in Scalar init (custom path)', async () => {
    const runner = await makeRunnerWith({ openapiJsonPath: '/x.json' })
    const ctx = mockCtx('GET', '/api/docs')
    await runner.runOnRequest(ctx as never)
    expect(ctx.response._body).toMatch(/url:\s*"\/x\.json"/)
  })

  it('embeds custom cdnUrl', async () => {
    const runner = await makeRunnerWith({ cdnUrl: 'https://my-cdn.com/s.js' })
    const ctx = mockCtx('GET', '/api/docs')
    await runner.runOnRequest(ctx as never)
    expect(ctx.response._body).toMatch(/<script src="https:\/\/my-cdn\.com\/s\.js">/)
  })
})

describe('T3.3 — GET /api/docs/openapi.json serves JSON', () => {
  it('returns 503 OPENAPI_NOT_EMITTED when file missing', async () => {
    const runner = await makeRunnerWith()
    const ctx = mockCtx('GET', '/api/docs/openapi.json')
    await runner.runOnRequest(ctx as never)
    expect(ctx.response.statusCode).toBe(503)
    const body = JSON.parse(ctx.response._body) as { error: { code: string } }
    expect(body.error.code).toBe('OPENAPI_NOT_EMITTED')
  })

  it('returns 200 when file exists', async () => {
    mkdirSync(join(tmpCwd, '.theo'), { recursive: true })
    writeFileSync(
      join(tmpCwd, '.theo', 'openapi.json'),
      JSON.stringify({ openapi: '3.1.0', paths: {} }),
      'utf-8',
    )
    const runner = await makeRunnerWith()
    const ctx = mockCtx('GET', '/api/docs/openapi.json')
    await runner.runOnRequest(ctx as never)
    expect(ctx.response.statusCode).toBe(200)
    expect(ctx.response._body).toMatch(/3\.1\.0/)
  })
})

describe('T3.3 — pass-through behavior', () => {
  it('non-matching URL passes through (no response written)', async () => {
    const runner = await makeRunnerWith()
    const ctx = mockCtx('GET', '/other/path')
    await runner.runOnRequest(ctx as never)
    expect(ctx.response.end).not.toHaveBeenCalled()
  })

  it('EC-7: HEAD method on /api/docs passes through (k8s liveness compat)', async () => {
    const runner = await makeRunnerWith()
    const ctx = mockCtx('HEAD', '/api/docs')
    await runner.runOnRequest(ctx as never)
    expect(ctx.response.end).not.toHaveBeenCalled()
  })

  it('EC-7: POST /api/docs passes through (only GET handled)', async () => {
    const runner = await makeRunnerWith()
    const ctx = mockCtx('POST', '/api/docs')
    await runner.runOnRequest(ctx as never)
    expect(ctx.response.end).not.toHaveBeenCalled()
  })

  it('EC-6: trailing slash does NOT match /api/docs', async () => {
    const runner = await makeRunnerWith()
    const ctx = mockCtx('GET', '/api/docs/')
    await runner.runOnRequest(ctx as never)
    expect(ctx.response.end).not.toHaveBeenCalled()
  })
})

describe('T3.3 — EC-3 writableEnded guard (defensive)', () => {
  it('EC-3: skips when response.writableEnded === true', async () => {
    const runner = await makeRunnerWith()
    const ctx = mockCtx('GET', '/api/docs')
    ctx.response.writableEnded = true // simulate prior plugin already wrote
    await runner.runOnRequest(ctx as never)
    expect(ctx.response.end).not.toHaveBeenCalled()
  })

  it('EC-3: skips when response.headersSent === true', async () => {
    const runner = await makeRunnerWith()
    const ctx = mockCtx('GET', '/api/docs')
    ctx.response.headersSent = true
    await runner.runOnRequest(ctx as never)
    expect(ctx.response.end).not.toHaveBeenCalled()
  })
})
