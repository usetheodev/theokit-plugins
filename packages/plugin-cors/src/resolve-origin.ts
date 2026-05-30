/**
 * Resolve the response `Access-Control-Allow-Origin` value for a given
 * request, based on the configured origin matcher.
 *
 * Returns:
 *   - `'*'` when default behavior allows any origin
 *   - the echoed request origin when allowlist or predicate accepts it
 *   - `null` when the request has no Origin header OR no match — caller MUST
 *     NOT add CORS headers in that case
 *
 * EC-3 (MUST FIX): if `opts.origin` is a predicate function and it throws,
 * we catch the exception, log a warning, and treat as no-match. Without this
 * guard, a single bug in user predicate would 500 every request (denial of
 * service via a single plugin misconfiguration).
 */
import type { CorsOptionsResolved } from './options.js'

let predicateWarnLogged = false

export function resolveOrigin(
  requestOrigin: string | undefined,
  opts: CorsOptionsResolved,
): string | null {
  // No Origin header (server-to-server, curl without --header) → no CORS
  if (requestOrigin === undefined) return null

  // Default behavior: allow any origin (no credentials per W3C spec)
  if (opts.origin === undefined) return '*'

  // origin: '*' literal
  if (opts.origin === '*') return '*'

  // origin: true → echo
  if (opts.origin === true) return requestOrigin

  // origin: string → exact match
  if (typeof opts.origin === 'string') {
    return opts.origin === requestOrigin ? requestOrigin : null
  }

  // origin: string[] → allowlist
  if (Array.isArray(opts.origin)) {
    return opts.origin.includes(requestOrigin) ? requestOrigin : null
  }

  // origin: predicate
  if (typeof opts.origin === 'function') {
    try {
      const matched = opts.origin(requestOrigin)
      return matched ? requestOrigin : null
    } catch (err) {
      // EC-3 fix: predicate exception MUST NOT cascade to 500 on every request.
      // Log once, treat as no-match.
      if (!predicateWarnLogged) {
        predicateWarnLogged = true
        const msg = err instanceof Error ? err.message : String(err)
        console.warn(
          `[@usetheo/plugin-cors] origin predicate threw; treating as no-match (this message logs once per process): ${msg}`,
        )
      }
      return null
    }
  }

  // Unreachable per Zod validation; defensive return
  return null
}

/**
 * Returns `true` if the origin configuration is "dynamic" — meaning the
 * resolved value can differ per-request. Used by buildCorsHeaders to decide
 * whether to emit `Vary: Origin` (HTTP caching correctness — without Vary,
 * a proxy may cache one origin's response and serve it to others).
 *
 * Dynamic when: array (multiple candidates), predicate (computed), or `true`
 * (always echoes). Static when: `'*'` (constant) or single string (constant
 * or null).
 */
export function isDynamicOrigin(origin: CorsOptionsResolved['origin']): boolean {
  if (origin === undefined) return false // '*' is constant
  if (origin === '*') return false
  if (typeof origin === 'string') return false
  return true // true, array, function are all dynamic
}

/** @internal Reset the once-logged guard for tests. */
export function __resetPredicateWarnLoggedForTests(): void {
  predicateWarnLogged = false
}
