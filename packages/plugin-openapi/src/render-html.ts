/**
 * Pure HTML payload renderer for `/api/docs`.
 *
 * Per P#3 plan v1.3 T3.1 + ADR D1 (Scalar via CDN).
 *
 * **2026-06-03 CSP-friendly fix (v0.1.1):** the previous version emitted
 * a SECOND inline `<script>Scalar.createApiReference('#app', {...})</script>`
 * to bootstrap Scalar. That inline script is blocked by any `script-src 'self'`
 * CSP (theokit's default since 0.2.x), causing the page to render blank in
 * production-shaped apps. The fix uses Scalar's documented data-attribute
 * init pattern (`<script src="..." data-url="..."></script>`) — Scalar's
 * bundle reads attributes off its own script tag at load time, no inline
 * JS needed. Combined with the per-response CSP header set in `index.ts`,
 * the page renders under strict `script-src 'self'` defaults.
 *
 * Defense-in-depth XSS escaping (no inline JS context anymore):
 *   - pageTitle       → escapeHtml (HTML text-content context)
 *   - cdnUrl          → escapeAttr (HTML attribute context; Zod-validated)
 *   - openapiJsonPath → escapeAttr (HTML attribute context — `data-url`)
 */
import type { ValidatedOpenApiOptions } from './options.js'

export function renderScalarHtml(opts: ValidatedOpenApiOptions): string {
  const safeTitle = escapeHtml(opts.pageTitle)
  const safeCdnUrl = escapeAttr(opts.cdnUrl)
  const safeJsonPath = escapeAttr(opts.openapiJsonPath)

  // Scalar v1.58.x integration pattern — TWO script tags, per
  // github.com/scalar/scalar/blob/main/documentation/integrations/html-js.md:
  //   1. `<script id="api-reference" data-url="...">` — configuration carrier;
  //      Scalar's bundle scans the document for `#api-reference` on load and
  //      reads `data-url` (or `data-configuration`) off that tag. This tag
  //      stays empty body — it's a pure attribute container.
  //   2. `<script src="<cdn>">` — the actual bundle. After load it picks up
  //      the config tag and mounts to a generated container in <body>.
  //
  // Earlier v0.1.1 attempt put `data-url` on the BUNDLE script tag itself,
  // which Scalar 1.58 ignores — bundle loads but never initializes → blank
  // page. Discovered via Chrome DevTools `window.Scalar !== undefined` +
  // `#app.innerHTML.length === 0` after the v0.1.2 CSP fix.
  return `<!doctype html>
<html>
  <head>
    <title>${safeTitle}</title>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
  </head>
  <body>
    <script id="api-reference" data-url="${safeJsonPath}"></script>
    <script src="${safeCdnUrl}"></script>
  </body>
</html>
`
}

/**
 * Compute the CSP `script-src` source list for the `/api/docs` response.
 * Extracted as pure function for testability + reuse from `index.ts` when
 * setting the per-response Content-Security-Policy header.
 *
 * Returns the host origin of cdnUrl ("https://cdn.jsdelivr.net") so it can
 * be appended to the consumer's CSP without granting wildcard CDN access.
 */
export function cdnHostForCsp(cdnUrl: string): string {
  // Parse via URL — Zod already validated url() so this never throws.
  const u = new URL(cdnUrl)
  return `${u.protocol}//${u.host}`
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function escapeAttr(s: string): string {
  // Attribute context: same as text but with explicit double-quote escape
  // (which escapeHtml already covers; aliased for intent clarity).
  return escapeHtml(s)
}
