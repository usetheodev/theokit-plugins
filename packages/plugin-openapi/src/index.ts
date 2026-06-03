/**
 * @theokit/plugin-openapi — Scalar UI for TheoKit OpenAPI docs.
 *
 * Per P#3 plan v1.3 T3.3 + ADRs D1 D2 D5 + 3 absorbed edge cases (EC-3
 * writableEnded guard, EC-6 trailing-slash strict match, EC-7 GET-only).
 *
 * Mounts:
 *   GET /api/docs               → Scalar UI HTML (CDN-loaded; zero npm dep)
 *   GET /api/docs/openapi.json  → on-disk file (or 503/413/500 envelope)
 *
 * All other requests pass through (chain continues). Plugin handles ONLY
 * GET. POST/PUT/DELETE/HEAD on the docs paths pass through unmodified.
 *
 * Consumer apps wanting auth on /api/docs wrap the plugin with TheoKit
 * middleware — no auth shipped per ADR D4 (YAGNI; defer to consumer).
 */
import { defineTheoPlugin, type PluginContext, type TheoPlugin } from 'theokit/server'

import {
  validateOpenApiOptions,
  type OpenApiOptions,
} from './options.js'
import { cdnHostForCsp, renderScalarHtml } from './render-html.js'
import { serveOpenApiJson } from './serve-openapi-json.js'

export type { OpenApiOptions, ValidatedOpenApiOptions } from './options.js'
export { OpenApiPluginConfigError } from './options.js'
export { MAX_OPENAPI_JSON_BYTES } from './serve-openapi-json.js'

export default function openApiPlugin(options: OpenApiOptions = {}): TheoPlugin {
  const opts = validateOpenApiOptions(options)
  // cwd captured at instantiation (per AR-1 Accepted Risk in plan v1.1)
  const cwd = process.cwd()

  return defineTheoPlugin({
    name: '@theokit/plugin-openapi',
    register(app) {
      app.addHook('onRequest', (ctx: PluginContext) => {
        // EC-3 absorbed: defensive short-circuit when a prior plugin
        // already wrote the response. PluginRunner short-circuits AFTER
        // each hook returns (plugin-runner.ts:145) — NOT before — so this
        // guard protects against plugin-order misconfig. Without it,
        // ctx.response.end() throws ERR_STREAM_WRITE_AFTER_END.
        if (ctx.response.writableEnded || ctx.response.headersSent) return

        // EC-7 absorbed: only GET. HEAD/POST/PUT/DELETE pass through so
        // health-check tooling (k8s liveness) works + consumer apps
        // remain free to use the same paths for other verbs.
        if (ctx.request.method !== 'GET') return

        // EC-6 absorbed: exact-match path (no trailing-slash normalization).
        // Query string stripped.
        const url = ctx.request.url ?? ''
        const path = url.split('?', 1)[0]

        if (path === opts.docsPath) {
          ctx.response.statusCode = 200
          ctx.response.setHeader('Content-Type', 'text/html; charset=utf-8')
          // 2026-06-03 fix v0.1.1+v0.1.2: per-response CSP that allows the
          // Scalar CDN host. setHeader REPLACES any prior CSP (e.g. theokit's
          // default `script-src 'self'`) for this single response, scoped
          // strictly to /api/docs. Other routes keep the host CSP.
          //
          // 'unsafe-inline' for script-src stays OFF — the v0.1.1 render-html
          // change eliminated the inline init block. 'unsafe-eval' for
          // script-src is REQUIRED — Scalar's bundle uses eval() internally
          // for Vue runtime template compilation (verified via DevTools
          // CSP violation `standalone.js:314 script-src blocked`). Without
          // it the bundle loads but the Vue app cannot mount → blank page.
          // The exception is narrowly scoped to /api/docs only; the host
          // CSP for every other route stays strict (no eval). Industry
          // standard for API doc UIs (Swagger UI + Redoc require the same).
          // 'unsafe-inline' for STYLE is allowed because Scalar injects
          // dynamic styles at runtime (bundle requirement; not under our
          // control without forking).
          const cdnHost = cdnHostForCsp(opts.cdnUrl)
          ctx.response.setHeader(
            'Content-Security-Policy',
            [
              "default-src 'self'",
              `script-src 'self' 'unsafe-eval' ${cdnHost}`,
              "style-src 'self' 'unsafe-inline'",
              `img-src 'self' data: ${cdnHost}`,
              `font-src 'self' data: ${cdnHost}`,
              `connect-src 'self' ${cdnHost}`,
              "frame-ancestors 'none'",
            ].join('; '),
          )
          ctx.response.end(renderScalarHtml(opts))
          return
        }

        if (path === opts.openapiJsonPath) {
          serveOpenApiJson(ctx, opts, cwd)
          return
        }

        // Other URLs: no-op; chain continues
      })
    },
  })
}
