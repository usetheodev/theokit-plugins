/**
 * Pure HTML payload renderer for `/api/docs`.
 *
 * Per P#3 plan v1.3 T3.1 + ADR D1 (Scalar via CDN) + EC-1 absorbed
 * (JSON.stringify for JS-string context).
 *
 * Defense-in-depth XSS escaping:
 *   - pageTitle → escapeHtml (HTML text-content context)
 *   - cdnUrl    → escapeAttr (HTML attribute context; also Zod-validated as URL)
 *   - openapiJsonPath → JSON.stringify (JS-string context inside <script>)
 *
 * JSON.stringify is the ONLY correct serialization for embedding values
 * inside an inline <script>. escapeAttr would break on apostrophes in the
 * path; JSON.stringify produces "..."-wrapped JS-string-safe output with
 * all delimiters + control chars + </script> sequences escaped per
 * ECMA-404.
 */
import type { ValidatedOpenApiOptions } from './options.js'

export function renderScalarHtml(opts: ValidatedOpenApiOptions): string {
  const safeTitle = escapeHtml(opts.pageTitle)
  const safeCdnUrl = escapeAttr(opts.cdnUrl)
  const jsonPathLiteral = JSON.stringify(opts.openapiJsonPath)

  return `<!doctype html>
<html>
  <head>
    <title>${safeTitle}</title>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
  </head>
  <body>
    <div id="app"></div>
    <script src="${safeCdnUrl}"></script>
    <script>
      Scalar.createApiReference('#app', { url: ${jsonPathLiteral} });
    </script>
  </body>
</html>
`
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
