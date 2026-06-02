/**
 * JSON serve helper for `/api/docs/openapi.json`.
 *
 * Per P#3 plan v1.3 T3.2:
 *  - 503 OPENAPI_NOT_EMITTED when file absent (EC-5 absorbed) — graceful
 *    fresh-boot fallback before `theokit dev` first emit completes.
 *  - 413 OPENAPI_TOO_LARGE when file exceeds 10 MB cap (EC-2 absorbed) —
 *    DoS defense against runaway emit (circular schema, etc.).
 *  - 500 OPENAPI_READ_FAILED on any other fs error (path is a dir, EACCES).
 *  - 200 happy path with Content-Type application/json + Cache-Control
 *    no-cache (dev workflow: always fresh).
 */
/* eslint-disable security/detect-non-literal-fs-filename --
 * cwd + opts.openapiSourcePath flow from validated config (Zod refines
 * reject ".."); no HTTP input controls the path.
 */
import { existsSync, readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'

import type { PluginContext } from 'theokit/server'

import type { ValidatedOpenApiOptions } from './options.js'

/** Hard cap on openapi.json size — 10 MB. Typical docs are < 1 MB. */
export const MAX_OPENAPI_JSON_BYTES = 10 * 1024 * 1024

const DOCS_URL = 'https://theokit.dev/concepts/openapi'

export function serveOpenApiJson(
  ctx: PluginContext,
  opts: ValidatedOpenApiOptions,
  cwd: string,
): void {
  const path = resolve(cwd, opts.openapiSourcePath)

  // 503 — file not emitted yet (EC-5 absorbed)
  if (!existsSync(path)) {
    ctx.response.statusCode = 503
    ctx.response.setHeader('Content-Type', 'application/json; charset=utf-8')
    ctx.response.end(
      JSON.stringify({
        error: {
          code: 'OPENAPI_NOT_EMITTED',
          message:
            'OpenAPI document not yet emitted. Add `openapi: {...}` to theo.config.ts, then re-run theokit dev OR theokit openapi.',
          docs: DOCS_URL,
        },
      }),
    )
    return
  }

  // statSync + isFile check + size cap (EC-2 absorbed). Catches EACCES
  // (statSync throws) AND EISDIR (isFile false) BEFORE readFileSync.
  let size: number
  try {
    const stats = statSync(path)
    if (!stats.isFile()) {
      throw new Error(`openapiSourcePath ${opts.openapiSourcePath} resolved to a non-file (expected regular file)`)
    }
    size = stats.size
  } catch (err) {
    ctx.response.statusCode = 500
    ctx.response.setHeader('Content-Type', 'application/json; charset=utf-8')
    ctx.response.end(
      JSON.stringify({
        error: {
          code: 'OPENAPI_READ_FAILED',
          message: (err as Error).message,
        },
      }),
    )
    return
  }

  if (size > MAX_OPENAPI_JSON_BYTES) {
    ctx.response.statusCode = 413
    ctx.response.setHeader('Content-Type', 'application/json; charset=utf-8')
    ctx.response.end(
      JSON.stringify({
        error: {
          code: 'OPENAPI_TOO_LARGE',
          message: `OpenAPI document exceeds 10 MB cap (${String(size)} bytes). A document over the cap usually indicates a misconfigured emit (e.g., circular schema). Inspect ${opts.openapiSourcePath} or open an issue.`,
          maxBytes: MAX_OPENAPI_JSON_BYTES,
        },
      }),
    )
    return
  }

  // 200 happy path
  ctx.response.statusCode = 200
  ctx.response.setHeader('Content-Type', 'application/json; charset=utf-8')
  ctx.response.setHeader('Cache-Control', 'no-cache')
  ctx.response.end(readFileSync(path, 'utf-8'))
}
