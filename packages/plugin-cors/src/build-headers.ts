/**
 * Build the CORS response headers given the resolved origin + options.
 *
 * Returns an empty object when `resolvedOrigin === null` — caller MUST NOT
 * add any CORS headers in that case.
 *
 * `Vary: Origin` is emitted only when origin is dynamic (caching
 * correctness): proxies must vary cached response by Origin header to avoid
 * serving one origin's response to a different origin.
 *
 * Preflight-only headers (`Allow-Methods`, `Allow-Headers`, `Max-Age`) only
 * appear when `isPreflight === true`.
 */
import { isDynamicOrigin } from './resolve-origin.js'
import type { CorsOptionsResolved } from './options.js'

const DEFAULT_METHODS = ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE'] as const

export function buildCorsHeaders(
  opts: CorsOptionsResolved,
  resolvedOrigin: string | null,
  isPreflight: boolean,
): Record<string, string> {
  // No match → no CORS headers (caller must not add anything)
  if (resolvedOrigin === null) return {}

  const headers: Record<string, string> = {
    'Access-Control-Allow-Origin': resolvedOrigin,
  }

  // Vary: Origin only when origin is dynamic (caching correctness)
  if (isDynamicOrigin(opts.origin)) {
    headers.Vary = 'Origin'
  }

  if (opts.credentials === true) {
    headers['Access-Control-Allow-Credentials'] = 'true'
  }

  if (opts.exposedHeaders !== undefined && opts.exposedHeaders.length > 0) {
    headers['Access-Control-Expose-Headers'] = opts.exposedHeaders.join(', ')
  }

  if (isPreflight) {
    // Methods: configured or sensible default
    const methods = opts.methods ?? Array.from(DEFAULT_METHODS)
    headers['Access-Control-Allow-Methods'] = methods.join(', ')

    // Allowed headers: configured or '*' (means "echo request headers" at caller)
    if (opts.allowedHeaders !== undefined) {
      headers['Access-Control-Allow-Headers'] = opts.allowedHeaders.join(', ')
    }

    if (opts.maxAge !== undefined) {
      headers['Access-Control-Max-Age'] = String(opts.maxAge)
    }
  }

  return headers
}
