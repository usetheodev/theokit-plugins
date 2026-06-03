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
    expect(plugin.name).toBe('@theokit/plugin-openapi')
  })

  it('registers with PluginRunner without throwing', async () => {
    const runner = await makeRunnerWith()
    expect(runner.has('@theokit/plugin-openapi')).toBe(true)
  })

  it('duplicate registration throws DuplicatePluginError', async () => {
    const runner = new PluginRunner()
    await runner.register(openApiPlugin())
    await expect(runner.register(openApiPlugin())).rejects.toThrow(/already registered/i)
  })
})

describe('T3.3 — GET /api/docs serves HTML', () => {
  it('returns 200 + text/html + Scalar two-script embed (id=api-reference + bundle src)', async () => {
    // v0.1.1: data-url attribute pattern (CSP-friendly, no inline JS body).
    // v0.1.3: split into TWO script tags per Scalar 1.58 integration —
    //   <script id="api-reference" data-url="..."> config carrier
    //   <script src="<cdn>"> bundle script
    // The single-tag attribute attempt from v0.1.1 was silently ignored by
    // Scalar 1.58 → blank page (found via Chrome DevTools `#app` empty
    // after `window.Scalar` was already defined).
    const runner = await makeRunnerWith()
    const ctx = mockCtx('GET', '/api/docs')
    await runner.runOnRequest(ctx as never)
    expect(ctx.response.statusCode).toBe(200)
    expect(ctx.response._headers['Content-Type']).toMatch(/text\/html/)
    expect(ctx.response._body).toMatch(
      /<script\s+id="api-reference"\s+data-url="\/api\/docs\/openapi\.json"\s*>/,
    )
    expect(ctx.response._body).toMatch(
      /<script\s+src="https:\/\/cdn\.jsdelivr\.net\/npm\/@scalar\/api-reference"\s*>/,
    )
    expect(ctx.response._body).toMatch(/<!doctype html>/i)
  })

  it('REGRESSION v0.1.1+v0.1.2: /api/docs response sets per-route Content-Security-Policy allowing CDN host', async () => {
    // theokit default CSP (`script-src 'self'`) blocks both Scalar CDN +
    // any inline init script, causing the page to render blank. Plugin must
    // override CSP per-response for /api/docs to allow the CDN origin.
    const runner = await makeRunnerWith()
    const ctx = mockCtx('GET', '/api/docs')
    await runner.runOnRequest(ctx as never)
    const csp = ctx.response._headers['Content-Security-Policy']
    expect(csp, 'plugin must set Content-Security-Policy on /api/docs response').toBeDefined()
    // CDN origin must be in script-src
    expect(csp).toMatch(/script-src[^;]*\bhttps:\/\/cdn\.jsdelivr\.net\b/)
    // v0.1.2: 'unsafe-eval' MUST be present in script-src — Scalar's bundle
    // uses eval() internally for Vue runtime template compilation. Without
    // it the bundle loads but the Vue app cannot mount → blank page.
    const scriptSrcDirective = csp.split(';').find((d: string) => d.trim().startsWith('script-src'))
    expect(scriptSrcDirective).toMatch(/'unsafe-eval'/)
    // Must NOT contain 'unsafe-inline' for script-src (data-attribute pattern
    // means we don't need it; absence proves the fix is real, not a workaround)
    expect(scriptSrcDirective).not.toMatch(/'unsafe-inline'/)
    // frame-ancestors must remain 'none' (clickjacking defense, OWASP A05)
    expect(csp).toMatch(/frame-ancestors\s+'none'/)
  })

  it('REGRESSION v0.1.2: openapi.json response does NOT include unsafe-eval (narrow scoping)', async () => {
    // 'unsafe-eval' on script-src is needed ONLY for /api/docs (Scalar's
    // Vue runtime). The JSON endpoint must NOT carry it — proves the
    // exception is scoped, not blanket.
    const tmpDir = join(tmpCwd, '.theo')
    mkdirSync(tmpDir, { recursive: true })
    writeFileSync(join(tmpDir, 'openapi.json'), JSON.stringify({ openapi: '3.0.3' }))
    const runner = await makeRunnerWith()
    const ctx = mockCtx('GET', '/api/docs/openapi.json')
    await runner.runOnRequest(ctx as never)
    const csp = ctx.response._headers['Content-Security-Policy']
    expect(csp).toBeUndefined()
  })

  it('REGRESSION v0.1.1: /api/docs CSP uses custom cdnUrl host when consumer overrides cdnUrl', async () => {
    const runner = await makeRunnerWith({ cdnUrl: 'https://my-cdn.example.com/scalar.js' })
    const ctx = mockCtx('GET', '/api/docs')
    await runner.runOnRequest(ctx as never)
    const csp = ctx.response._headers['Content-Security-Policy']
    expect(csp).toMatch(/script-src[^;]*\bhttps:\/\/my-cdn\.example\.com\b/)
    expect(csp).not.toMatch(/jsdelivr/)
  })

  it('REGRESSION v0.1.1: openapi.json response does NOT get the docs-page CSP override (only /api/docs does)', async () => {
    // Belt + suspenders: the docs-page CSP allows external host. The JSON
    // endpoint must NOT carry it — it serves JSON, not HTML, and shouldn't
    // need the CDN allowance. Per-route scoping defense.
    const tmpDir = join(tmpCwd, '.theo')
    mkdirSync(tmpDir, { recursive: true })
    writeFileSync(join(tmpDir, 'openapi.json'), JSON.stringify({ openapi: '3.1.0' }))
    const runner = await makeRunnerWith()
    const ctx = mockCtx('GET', '/api/docs/openapi.json')
    await runner.runOnRequest(ctx as never)
    expect(ctx.response.statusCode).toBe(200)
    expect(ctx.response._headers['Content-Security-Policy']).toBeUndefined()
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

  it('embeds the openapiJsonPath in Scalar data-url attribute (custom path)', async () => {
    // v0.1.1 fix: was `url: "/x.json"` inside inline init script; now
    // `data-url="/x.json"` attribute on the CDN script tag.
    const runner = await makeRunnerWith({ openapiJsonPath: '/x.json' })
    const ctx = mockCtx('GET', '/api/docs')
    await runner.runOnRequest(ctx as never)
    expect(ctx.response._body).toMatch(/data-url="\/x\.json"/)
  })

  it('embeds custom cdnUrl', async () => {
    const runner = await makeRunnerWith({ cdnUrl: 'https://my-cdn.com/s.js' })
    const ctx = mockCtx('GET', '/api/docs')
    await runner.runOnRequest(ctx as never)
    // v0.1.3 two-script pattern — the bundle src tag stays clean (no data-url)
    expect(ctx.response._body).toMatch(/<script\s+src="https:\/\/my-cdn\.com\/s\.js"\s*>/)
    // and the config tag carries data-url separately
    expect(ctx.response._body).toMatch(/<script\s+id="api-reference"\s+data-url=/)
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
