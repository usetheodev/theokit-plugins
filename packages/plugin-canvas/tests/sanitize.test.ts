/**
 * T4.3 — defence-in-depth sanitiser tests. These run BEFORE renderers
 * touch the DOM so the strip behaviour is exercised in isolation.
 */
import { describe, expect, it } from 'vitest'

import { sanitizeHtmlSrcdoc, sanitizeSvg } from '../src/ui/renderers/sanitize.js'

describe('sanitizeSvg', () => {
  it('strips <script> tags and reports', () => {
    const { output, report } = sanitizeSvg(
      '<svg><script>alert(1)</script><rect /></svg>',
    )
    expect(output).not.toMatch(/<script/i)
    expect(output).toMatch(/<rect/)
    expect(report.removedScript).toBe(true)
  })

  it('strips on* handlers', () => {
    const { output, report } = sanitizeSvg(
      '<svg><rect onclick="alert(1)" onmouseenter=\'bad()\' /></svg>',
    )
    expect(output).not.toMatch(/onclick/)
    expect(output).not.toMatch(/onmouseenter/)
    expect(report.removedOnHandler).toBe(true)
  })

  it('strips javascript: URLs in href / xlink:href / src', () => {
    const { output, report } = sanitizeSvg(
      `<svg><a href="javascript:bad()"><image xlink:href='javascript:bad()'/></a></svg>`,
    )
    expect(output).not.toMatch(/javascript:/)
    expect(report.removedJsUrl).toBe(true)
  })

  it('strips <iframe>, <object>, <embed>', () => {
    const { output, report } = sanitizeSvg(
      '<svg><iframe src="evil"></iframe><object data="evil"></object><embed src="evil"/></svg>',
    )
    expect(output).not.toMatch(/<iframe/i)
    expect(output).not.toMatch(/<object/i)
    expect(output).not.toMatch(/<embed/i)
    expect(report.removedIframe).toBe(true)
    expect(report.removedObject).toBe(true)
    expect(report.removedEmbed).toBe(true)
  })

  it('strips data:text/html and data:application/javascript URLs', () => {
    const { output, report } = sanitizeSvg(
      `<svg><a href="data:text/html,<script>bad()</script>">x</a></svg>`,
    )
    expect(output).not.toMatch(/data:text\/html/)
    expect(report.removedDataUrl).toBe(true)
  })

  it('is a no-op for clean SVG', () => {
    const clean = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>'
    const { output, report } = sanitizeSvg(clean)
    expect(output).toBe(clean)
    expect(report.removedScript).toBe(false)
    expect(report.removedOnHandler).toBe(false)
    expect(report.removedJsUrl).toBe(false)
  })
})

describe('sanitizeHtmlSrcdoc', () => {
  it('strips <meta http-equiv="refresh"> redirects', () => {
    const { output } = sanitizeHtmlSrcdoc(
      '<meta http-equiv="refresh" content="0;url=https://evil"><p>hi</p>',
    )
    expect(output).not.toMatch(/<meta[^>]*refresh/i)
    expect(output).toMatch(/<p>hi/)
  })

  it('is a no-op for benign HTML', () => {
    const clean = '<!doctype html><p>hi</p>'
    expect(sanitizeHtmlSrcdoc(clean).output).toBe(clean)
  })
})
