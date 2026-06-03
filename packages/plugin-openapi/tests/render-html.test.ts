/**
 * T3.1 — Scalar HTML renderer (pure function).
 *
 * Per P#3 plan v1.3 T3.1.
 *
 * **2026-06-03 CSP-friendly fix (v0.1.1):** EC-1 originally embedded
 * `openapiJsonPath` via `JSON.stringify` inside an inline
 * `<script>Scalar.createApiReference(...)</script>` block. That inline
 * script was blocked by theokit's default `script-src 'self'` CSP,
 * causing the page to render blank in production-shaped apps. The fix
 * removes the inline script entirely + uses Scalar's documented
 * `<script src="..." data-url="..."></script>` data-attribute init
 * pattern. The original 2 EC-1 tests are kept as regression tests with
 * inverted assertions (the OLD broken inline form MUST NOT appear in
 * output anymore).
 */
import { describe, expect, it } from 'vitest'

import { cdnHostForCsp, renderScalarHtml } from '../src/render-html.js'
import { validateOpenApiOptions } from '../src/options.js'

const baseOpts = () => validateOpenApiOptions({})

describe('renderScalarHtml — structural', () => {
  it('output starts with <!doctype html>', () => {
    expect(renderScalarHtml(baseOpts())).toMatch(/^<!doctype html>/i)
  })

  it('embeds the CDN script with default jsdelivr URL', () => {
    expect(renderScalarHtml(baseOpts())).toMatch(
      /<script\s+src="https:\/\/cdn\.jsdelivr\.net\/npm\/@scalar\/api-reference"/,
    )
  })

  it('uses pageTitle in <title>', () => {
    const html = renderScalarHtml(validateOpenApiOptions({ pageTitle: 'My App' }))
    expect(html).toMatch(/<title>My App<\/title>/)
  })

  it('escapes <script> in pageTitle (no raw tag injection)', () => {
    const html = renderScalarHtml(
      validateOpenApiOptions({ pageTitle: '<script>alert(1)</script>' }),
    )
    expect(html).not.toMatch(/<title><script>alert\(1\)<\/script>/)
    expect(html).toMatch(/<title>&lt;script&gt;alert\(1\)&lt;\/script&gt;<\/title>/)
  })

  it('uses custom cdnUrl when provided', () => {
    const html = renderScalarHtml(
      validateOpenApiOptions({ cdnUrl: 'https://my-cdn.com/s.js' }),
    )
    expect(html).toMatch(/<script\s+src="https:\/\/my-cdn\.com\/s\.js"/)
  })
})

describe('renderScalarHtml — CSP-friendly data-attribute init (v0.1.1 fix)', () => {
  it('embeds openapiJsonPath via data-url attribute (Scalar data-attribute init pattern)', () => {
    const html = renderScalarHtml(
      validateOpenApiOptions({ openapiJsonPath: '/api/docs/openapi.json' }),
    )
    // data-url attribute on the CDN script tag (Scalar reads it on load)
    expect(html).toMatch(/<script[^>]*\sdata-url="\/api\/docs\/openapi\.json"/)
  })

  it('REGRESSION: must NOT emit an inline init <script>Scalar.createApiReference</script>', () => {
    // 2026-06-03 fix v0.1.1: the OLD form is blocked by `script-src 'self'`.
    // If this test fails, /api/docs renders blank under default theokit CSP.
    const html = renderScalarHtml(baseOpts())
    expect(html).not.toMatch(/Scalar\.createApiReference/)
    // Must not contain any inline script body (the only <script> tag is the
    // CDN-src tag — body is empty)
    const inlineScriptBody = html.match(/<script(?![^>]*\ssrc=)>([\s\S]*?)<\/script>/)
    expect(inlineScriptBody).toBeNull()
  })

  it('REGRESSION: must not contain `url:` JSON literal that would only make sense in inline init', () => {
    // Defense in depth — the inline init pattern used `url: "..."`. Absence
    // proves the renderer fully moved to data-attribute pattern.
    const html = renderScalarHtml(baseOpts())
    expect(html).not.toMatch(/\burl:\s*"/)
  })

  it('html-escapes openapiJsonPath in data-url attribute (XSS defense in attribute context)', () => {
    const html = renderScalarHtml(
      validateOpenApiOptions({ openapiJsonPath: '/api/x"><script>alert(1)</script>' }),
    )
    // The path got rejected by validator? No — validator only checks "starts
    // with /". A pathological path containing quotes/script tags must be
    // attribute-escaped so it cannot break out of the data-url attribute.
    expect(html).not.toMatch(/data-url="[^"]*"><script>alert/)
    expect(html).toMatch(/data-url="[^"]*&quot;&gt;&lt;script&gt;alert/)
  })
})

describe('cdnHostForCsp — pure function', () => {
  it('returns scheme+host for default jsdelivr CDN', () => {
    expect(cdnHostForCsp('https://cdn.jsdelivr.net/npm/@scalar/api-reference')).toBe(
      'https://cdn.jsdelivr.net',
    )
  })

  it('preserves port when CDN URL has one', () => {
    expect(cdnHostForCsp('https://my-cdn.example.com:8443/scalar.js')).toBe(
      'https://my-cdn.example.com:8443',
    )
  })

  it('does NOT include the path (so CSP grants the origin only, not a wildcard)', () => {
    const host = cdnHostForCsp('https://cdn.jsdelivr.net/npm/@scalar/api-reference/foo/bar')
    expect(host).not.toContain('/npm')
    expect(host).not.toContain('/foo')
    expect(host).toBe('https://cdn.jsdelivr.net')
  })
})
