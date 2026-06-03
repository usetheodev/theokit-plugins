/**
 * @theokit/plugin-cors — CORS middleware for TheoKit.
 *
 * Wires `validateCorsOptions` + `resolveOrigin` + `buildCorsHeaders` into a
 * TheoPlugin. Preflight OPTIONS short-circuits with 204 (configurable via
 * `optionsSuccessStatus`). Normal responses get CORS headers set in
 * `onResponse`.
 *
 * ADR-0011 (TheoKit core) — moderate plugin roadmap strategy
 * ADR-0008 (TheoKit core) — TheoPlugin is the canonical SDK
 */
// `defineTheoPlugin` is the canonical name in published TheoKit alpha
// (>=0.1.0-alpha.5). The shorter alias `definePlugin` exists in the dev
// workspace but is not yet published to npm. Using `defineTheoPlugin` ensures
// end users installing from npm get a working plugin today. When TheoKit
// publishes a version that exposes `definePlugin`, this import can switch
// in a minor bump.
import { defineTheoPlugin, type TheoPlugin, type PluginContext } from 'theokit/server'
import { validateCorsOptions, type CorsOptions } from './options.js'
import { resolveOrigin } from './resolve-origin.js'
import { buildCorsHeaders } from './build-headers.js'

export type { CorsOptions } from './options.js'

export default function corsPlugin(options: CorsOptions = {}): TheoPlugin {
  // EC-3-aware: validation throws synchronously at construction time so the
  // app fails fast on misconfiguration rather than mid-request.
  const opts = validateCorsOptions(options)
  const optionsSuccessStatus = opts.optionsSuccessStatus ?? 204
  const preflightContinue = opts.preflightContinue === true

  return defineTheoPlugin({
    name: '@theokit/plugin-cors',
    register(app) {
      // Preflight handler — onRequest, short-circuits with 204 + CORS headers.
      // PluginRunner detects writableEnded/headersSent and stops the hook
      // chain automatically (see packages/theo/src/server/plugins/plugin-runner.ts).
      app.addHook('onRequest', (ctx: PluginContext) => {
        if (ctx.request.method !== 'OPTIONS') return
        const acrm = ctx.request.headers['access-control-request-method']
        // OPTIONS without Access-Control-Request-Method is not a CORS preflight
        if (acrm === undefined) return

        const requestOrigin = getRequestOrigin(ctx.request.headers)
        const resolved = resolveOrigin(requestOrigin, opts)
        const headers = buildCorsHeaders(opts, resolved, true)

        // If user didn't configure allowedHeaders explicitly, echo the
        // Access-Control-Request-Headers value back (mirrors @fastify/cors
        // and Express cors behavior — meets the spec without overrunning).
        if (resolved !== null && opts.allowedHeaders === undefined) {
          const acrh = ctx.request.headers['access-control-request-headers']
          if (typeof acrh === 'string') {
            headers['Access-Control-Allow-Headers'] = acrh
          }
        }

        for (const [k, v] of Object.entries(headers)) {
          ctx.response.setHeader(k, v)
        }

        if (!preflightContinue) {
          ctx.response.statusCode = optionsSuccessStatus
          ctx.response.setHeader('Content-Length', '0')
          ctx.response.end()
        }
      })

      // Normal response — onResponse, just adds CORS headers without ending.
      app.addHook('onResponse', (ctx: PluginContext) => {
        // Preflight already handled in onRequest; skip on OPTIONS to avoid
        // double-setting headers (in case of weird OPTIONS with no preflight).
        if (ctx.request.method === 'OPTIONS') return
        // Can't modify after headers sent (streaming responses)
        if (ctx.response.headersSent) return

        const requestOrigin = getRequestOrigin(ctx.request.headers)
        const resolved = resolveOrigin(requestOrigin, opts)
        const headers = buildCorsHeaders(opts, resolved, false)

        for (const [k, v] of Object.entries(headers)) {
          ctx.response.setHeader(k, v)
        }
      })
    },
  })
}

function getRequestOrigin(headers: NodeJS.Dict<string | string[]>): string | undefined {
  const o = headers.origin
  return typeof o === 'string' ? o : undefined
}
