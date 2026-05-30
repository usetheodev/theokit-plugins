/**
 * Unit tests for the wired TheoPlugin. Uses minimal mocks of TheoApp +
 * PluginContext to exercise the hooks directly without booting a real
 * TheoKit server. Real PluginRunner integration is covered in T3.2.
 */
import { describe, expect, it, vi } from 'vitest'
import corsPlugin from '../src/index.js'
import type { HookName, PluginContext, TheoApp } from 'theokit/server'

interface CapturedHook {
  name: HookName
  fn: (ctx: PluginContext) => void | Promise<void>
}

function mockApp(): { app: TheoApp; hooks: CapturedHook[] } {
  const hooks: CapturedHook[] = []
  const app: TheoApp = {
    addHook(name, fn) {
      hooks.push({
        name,
        fn: fn as unknown as (ctx: PluginContext) => void | Promise<void>,
      })
    },
    decorateRequest() {
      // not used by cors plugin
    },
  }
  return { app, hooks }
}

interface MockReq {
  method: string
  headers: NodeJS.Dict<string | string[]>
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
  return { method, headers }
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
    requestId: 'test-request',
  }
}

function getHook(
  hooks: CapturedHook[],
  name: HookName,
): (ctx: PluginContext) => void | Promise<void> {
  const h = hooks.find((h) => h.name === name)
  if (!h) throw new Error(`No ${name} hook registered`)
  return h.fn
}

describe('T2.3 — corsPlugin wired as TheoPlugin', () => {
  describe('happy path', () => {
    it('preflight short-circuits with 204 + CORS headers', async () => {
      const plugin = corsPlugin({ origin: 'https://a.com', methods: ['GET', 'POST'] })
      const { app, hooks } = mockApp()
      await plugin.register(app)

      const req = mockReq('OPTIONS', {
        origin: 'https://a.com',
        'access-control-request-method': 'POST',
      })
      const res = mockRes()
      const ctx = mockCtx(req, res)

      await getHook(hooks, 'onRequest')(ctx)

      expect(res.statusCode).toBe(204)
      expect(res.end).toHaveBeenCalledOnce()
      expect(res._headers['Access-Control-Allow-Origin']).toBe('https://a.com')
      expect(res._headers['Access-Control-Allow-Methods']).toBe('GET, POST')
    })

    it('preflight uses custom optionsSuccessStatus', async () => {
      const plugin = corsPlugin({
        origin: '*',
        optionsSuccessStatus: 200,
      })
      const { app, hooks } = mockApp()
      await plugin.register(app)

      const ctx = mockCtx(
        mockReq('OPTIONS', { origin: 'https://a.com', 'access-control-request-method': 'GET' }),
        mockRes(),
      )
      await getHook(hooks, 'onRequest')(ctx)
      expect(ctx.response.statusCode).toBe(200)
    })

    it('preflight echoes Access-Control-Request-Headers when allowedHeaders omitted', async () => {
      const plugin = corsPlugin({ origin: '*' })
      const { app, hooks } = mockApp()
      await plugin.register(app)

      const res = mockRes()
      const ctx = mockCtx(
        mockReq('OPTIONS', {
          origin: 'https://a.com',
          'access-control-request-method': 'POST',
          'access-control-request-headers': 'X-Custom-Header, X-Another',
        }),
        res,
      )
      await getHook(hooks, 'onRequest')(ctx)
      expect(res._headers['Access-Control-Allow-Headers']).toBe('X-Custom-Header, X-Another')
    })

    it('preflightContinue:true does NOT short-circuit', async () => {
      const plugin = corsPlugin({ origin: '*', preflightContinue: true })
      const { app, hooks } = mockApp()
      await plugin.register(app)

      const res = mockRes()
      const ctx = mockCtx(
        mockReq('OPTIONS', { origin: 'https://a.com', 'access-control-request-method': 'GET' }),
        res,
      )
      await getHook(hooks, 'onRequest')(ctx)
      expect(res.end).not.toHaveBeenCalled()
    })

    it('normal response adds CORS headers via onResponse', async () => {
      const plugin = corsPlugin({ origin: 'https://a.com', credentials: true })
      const { app, hooks } = mockApp()
      await plugin.register(app)

      const res = mockRes()
      const ctx = mockCtx(mockReq('GET', { origin: 'https://a.com' }), res)
      await getHook(hooks, 'onResponse')(ctx)
      expect(res._headers['Access-Control-Allow-Origin']).toBe('https://a.com')
      expect(res._headers['Access-Control-Allow-Credentials']).toBe('true')
    })
  })

  describe('edge cases', () => {
    it('OPTIONS without Access-Control-Request-Method is not preflight (falls through)', async () => {
      const plugin = corsPlugin({ origin: '*' })
      const { app, hooks } = mockApp()
      await plugin.register(app)

      const res = mockRes()
      const ctx = mockCtx(mockReq('OPTIONS', { origin: 'https://a.com' }), res)
      await getHook(hooks, 'onRequest')(ctx)
      expect(res.end).not.toHaveBeenCalled()
      expect(res.setHeader).not.toHaveBeenCalled()
    })

    it('normal response with no Origin header adds no CORS headers', async () => {
      const plugin = corsPlugin({ origin: ['https://a.com'] })
      const { app, hooks } = mockApp()
      await plugin.register(app)

      const res = mockRes()
      const ctx = mockCtx(mockReq('GET', {}), res) // no origin
      await getHook(hooks, 'onResponse')(ctx)
      expect(Object.keys(res._headers).length).toBe(0)
    })

    it('onResponse skipped when headersSent is true', async () => {
      const plugin = corsPlugin({ origin: '*' })
      const { app, hooks } = mockApp()
      await plugin.register(app)

      const res = mockRes()
      res.headersSent = true
      const ctx = mockCtx(mockReq('GET', { origin: 'https://a.com' }), res)
      await getHook(hooks, 'onResponse')(ctx)
      expect(res.setHeader).not.toHaveBeenCalled()
    })

    it('onResponse skips OPTIONS (preflight already handled)', async () => {
      const plugin = corsPlugin({ origin: '*' })
      const { app, hooks } = mockApp()
      await plugin.register(app)

      const res = mockRes()
      const ctx = mockCtx(mockReq('OPTIONS', { origin: 'https://a.com' }), res)
      await getHook(hooks, 'onResponse')(ctx)
      expect(res.setHeader).not.toHaveBeenCalled()
    })

    it('disallowed origin adds no CORS headers', async () => {
      const plugin = corsPlugin({ origin: ['https://allowed.com'] })
      const { app, hooks } = mockApp()
      await plugin.register(app)

      const res = mockRes()
      const ctx = mockCtx(mockReq('GET', { origin: 'https://denied.com' }), res)
      await getHook(hooks, 'onResponse')(ctx)
      expect(res._headers['Access-Control-Allow-Origin']).toBeUndefined()
    })
  })

  describe('error scenario', () => {
    it('throws at construction on W3C-invalid options', () => {
      expect(() => corsPlugin({ origin: '*', credentials: true })).toThrow(
        /forbidden by the CORS spec/,
      )
    })
  })

  describe('plugin shape', () => {
    it('returns a TheoPlugin with correct name', () => {
      const plugin = corsPlugin({})
      expect(plugin.name).toBe('@usetheo/plugin-cors')
      expect(typeof plugin.register).toBe('function')
    })

    it('registers both onRequest and onResponse hooks', async () => {
      const plugin = corsPlugin({})
      const { app, hooks } = mockApp()
      await plugin.register(app)
      expect(hooks.find((h) => h.name === 'onRequest')).toBeDefined()
      expect(hooks.find((h) => h.name === 'onResponse')).toBeDefined()
    })
  })
})
