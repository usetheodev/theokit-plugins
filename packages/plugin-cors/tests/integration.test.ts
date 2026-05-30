/**
 * Integration test — exercises @usetheo/plugin-cors against the REAL
 * PluginRunner from `theokit/server` (cross-repo via D7).
 *
 * Uses minimal IncomingMessage/ServerResponse mocks to drive hooks without
 * booting a full HTTP server. This validates the contract end-to-end:
 *   - plugin registers correctly via PluginRunner.register()
 *   - onRequest hook fires for preflight, short-circuits with 204
 *   - onResponse hook fires for normal requests, adds CORS headers
 *   - PluginRunner's writableEnded/headersSent detection works with our plugin
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PluginRunner } from 'theokit/server'
import corsPlugin from '../src/index.js'
import type { PluginContext } from 'theokit/server'

interface MockReq {
  method: string
  headers: NodeJS.Dict<string | string[]>
  url: string
}

interface MockRes {
  setHeader: ReturnType<typeof vi.fn>
  end: ReturnType<typeof vi.fn>
  statusCode: number
  headersSent: boolean
  writableEnded: boolean
  _headers: Record<string, string>
}

function mockReq(method: string, headers: Record<string, string> = {}): MockReq {
  return { method, headers, url: '/test' }
}

function mockRes(): MockRes {
  const _headers: Record<string, string> = {}
  const res: MockRes = {
    statusCode: 200,
    headersSent: false,
    writableEnded: false,
    _headers,
    setHeader: vi.fn((k: string, v: string | number) => {
      _headers[k] = String(v)
    }),
    end: vi.fn(() => {
      res.writableEnded = true
    }),
  }
  return res
}

function mockCtx(req: MockReq, res: MockRes): PluginContext {
  return {
    request: req as unknown as PluginContext['request'],
    response: res as unknown as PluginContext['response'],
    ctx: {},
    requestId: 'integration-test',
  }
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('T3.2 — integration with real PluginRunner (EC-10 verified)', () => {
  it('PluginRunner is exported from theokit/server (EC-10 prereq)', () => {
    expect(typeof PluginRunner).toBe('function')
  })

  it('preflight returns 204 + CORS headers via real PluginRunner', async () => {
    const runner = new PluginRunner()
    await runner.register(corsPlugin({ origin: ['https://allowed.com'], credentials: true }))

    const res = mockRes()
    const ctx = mockCtx(
      mockReq('OPTIONS', {
        origin: 'https://allowed.com',
        'access-control-request-method': 'POST',
      }),
      res,
    )

    const result = await runner.runOnRequest(ctx)
    expect(result.shortCircuited).toBe(true)
    expect(res.statusCode).toBe(204)
    expect(res._headers['Access-Control-Allow-Origin']).toBe('https://allowed.com')
    expect(res._headers['Access-Control-Allow-Credentials']).toBe('true')
  })

  it('normal GET request gets CORS headers via real PluginRunner onResponse', async () => {
    const runner = new PluginRunner()
    await runner.register(corsPlugin({ origin: 'https://a.com' }))

    const res = mockRes()
    const ctx = mockCtx(mockReq('GET', { origin: 'https://a.com' }), res)

    await runner.runOnRequest(ctx)
    await runner.runOnResponse(ctx)

    expect(res._headers['Access-Control-Allow-Origin']).toBe('https://a.com')
  })

  it('request without Origin header adds no CORS headers (server-to-server)', async () => {
    const runner = new PluginRunner()
    await runner.register(corsPlugin({ origin: ['https://a.com'] }))

    const res = mockRes()
    const ctx = mockCtx(mockReq('GET', {}), res)

    await runner.runOnRequest(ctx)
    await runner.runOnResponse(ctx)

    expect(res._headers['Access-Control-Allow-Origin']).toBeUndefined()
  })

  it('disallowed origin adds no CORS headers', async () => {
    const runner = new PluginRunner()
    await runner.register(corsPlugin({ origin: ['https://allowed.com'] }))

    const res = mockRes()
    const ctx = mockCtx(mockReq('GET', { origin: 'https://denied.com' }), res)

    await runner.runOnRequest(ctx)
    await runner.runOnResponse(ctx)

    expect(res._headers['Access-Control-Allow-Origin']).toBeUndefined()
  })

  it('preflightContinue:true does NOT short-circuit (handler can run after)', async () => {
    const runner = new PluginRunner()
    await runner.register(corsPlugin({ origin: '*', preflightContinue: true }))

    const res = mockRes()
    const ctx = mockCtx(
      mockReq('OPTIONS', { origin: 'https://a.com', 'access-control-request-method': 'POST' }),
      res,
    )

    const result = await runner.runOnRequest(ctx)
    expect(result.shortCircuited).toBe(false)
    expect(res.end).not.toHaveBeenCalled()
  })

  it('throws at construction on W3C-invalid options (not at runtime)', () => {
    expect(() => corsPlugin({ origin: '*', credentials: true })).toThrow(
      /forbidden by the CORS spec/,
    )
  })

  it('Vary: Origin set on dynamic origin (caching correctness)', async () => {
    const runner = new PluginRunner()
    await runner.register(corsPlugin({ origin: ['https://a.com', 'https://b.com'] }))

    const res = mockRes()
    const ctx = mockCtx(mockReq('GET', { origin: 'https://a.com' }), res)
    await runner.runOnRequest(ctx)
    await runner.runOnResponse(ctx)

    expect(res._headers.Vary).toBe('Origin')
  })
})
