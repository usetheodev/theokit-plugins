/**
 * @usetheo/plugin-openapi — Scalar UI for TheoKit OpenAPI docs.
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
import { renderScalarHtml } from './render-html.js'
import { serveOpenApiJson } from './serve-openapi-json.js'

export type { OpenApiOptions, ValidatedOpenApiOptions } from './options.js'
export { OpenApiPluginConfigError } from './options.js'
export { MAX_OPENAPI_JSON_BYTES } from './serve-openapi-json.js'

export default function openApiPlugin(options: OpenApiOptions = {}): TheoPlugin {
  const opts = validateOpenApiOptions(options)
  // cwd captured at instantiation (per AR-1 Accepted Risk in plan v1.1)
  const cwd = process.cwd()

  return defineTheoPlugin({
    name: '@usetheo/plugin-openapi',
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
