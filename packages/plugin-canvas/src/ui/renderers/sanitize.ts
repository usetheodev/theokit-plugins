/**
 * Defence-in-depth sanitisation for renderer-side SVG and HTML content.
 *
 * Uses DOMPurify (DOM-based parser + allowlist) instead of regex to
 * eliminate the class of XSS bypass vectors inherent to regex-based
 * HTML parsing (OWASP recommendation). See plan T1.2 / ADR D1.
 */
import DOMPurify from 'isomorphic-dompurify'

export interface SanitizeReport {
  removedScript: boolean
  removedIframe: boolean
  removedObject: boolean
  removedEmbed: boolean
  removedOnHandler: boolean
  removedJsUrl: boolean
  removedDataUrl: boolean
}

export interface SanitizeResult {
  output: string
  report: SanitizeReport
}

function createEmptyReport(): SanitizeReport {
  return {
    removedScript: false,
    removedIframe: false,
    removedObject: false,
    removedEmbed: false,
    removedOnHandler: false,
    removedJsUrl: false,
    removedDataUrl: false,
  }
}

/** Shape of a `DOMPurify.removed` entry (element removal OR attribute removal). */
interface RemovedEntry {
  element?: { nodeName?: string } | null
  attribute?: { name?: string; value?: string } | null
}

/**
 * Classify what DOMPurify actually removed, read from `DOMPurify.removed`
 * (T1.4 / ADR D2). This replaces the old input-vs-output regex diff, which was
 * lossy (#180) — DOMPurify reports the real removed elements and attributes, so
 * the security verdict the boundary relies on is exact, not inferred. The parser
 * wrapper element (`BODY`) is filtered out; node names are case-normalised.
 */
/** #186: element nodeName → the SanitizeReport flag it sets (lookup, not if-chain). */
const REMOVED_ELEMENT_FLAG: Record<string, keyof SanitizeReport> = {
  script: 'removedScript',
  iframe: 'removedIframe',
  object: 'removedObject',
  embed: 'removedEmbed',
}

function classifyRemoved(removed: readonly RemovedEntry[]): SanitizeReport {
  const report = createEmptyReport()
  for (const entry of removed) {
    if (entry.element) classifyRemovedElement(report, entry.element)
    else if (entry.attribute) classifyRemovedAttribute(report, entry.attribute)
  }
  return report
}

function classifyRemovedElement(report: SanitizeReport, element: { nodeName?: string }): void {
  const name = String(element.nodeName ?? '').toLowerCase()
  const flag = REMOVED_ELEMENT_FLAG[name]
  if (flag !== undefined) report[flag] = true
}

function classifyRemovedAttribute(
  report: SanitizeReport,
  attribute: { name?: string; value?: string },
): void {
  const attrName = String(attribute.name ?? '').toLowerCase()
  const attrValue = String(attribute.value ?? '')
  if (/^on/i.test(attrName)) report.removedOnHandler = true
  if (/^\s*javascript:/i.test(attrValue)) report.removedJsUrl = true
  if (/^\s*data:(?:text\/html|application\/javascript)/i.test(attrValue)) {
    report.removedDataUrl = true
  }
}

/**
 * `uponSanitizeAttribute` hook for the SVG pass. Replaces the old post-sanitize
 * regex MUTATE (#179) with in-parse attribute policy:
 *   - scrub CSS `expression(...)` from `style` (DOMPurify does not strip it),
 *   - drop external (non-fragment) `href`/`xlink:href` on `<use>` (defense in
 *     depth — `<use>` is currently dropped by the SVG profile, but this guards
 *     the day it is re-allowed; the old regex did this post-hoc and could
 *     mangle valid markup).
 */
function svgAttributePolicy(
  node: { nodeName?: string },
  data: { attrName: string; attrValue: string; keepAttr: boolean },
): void {
  if (data.attrName === 'style' && /expression\s*\(/i.test(data.attrValue)) {
    data.attrValue = data.attrValue.replace(/expression\s*\([^)]*\)/gi, '')
  }
  if (
    (data.attrName === 'href' || data.attrName === 'xlink:href') &&
    String(node.nodeName ?? '').toLowerCase() === 'use' &&
    !data.attrValue.startsWith('#')
  ) {
    data.keepAttr = false
  }
}

export function sanitizeSvg(input: string): SanitizeResult {
  // MUST remain SYNCHRONOUS: the singleton hook and the `DOMPurify.removed`
  // snapshot below are not re-entrancy-safe across `await`. DOMPurify.sanitize
  // is sync and JS is single-threaded, so two sanitize calls never interleave;
  // adding an `await` inside this function would break that invariant.
  //
  // In-parse attribute policy (expression scrub + external <use> drop) replaces
  // the old post-sanitize regex MUTATE (#179). Registered on the singleton, so
  // it MUST be removed in `finally` — a leaked hook corrupts every other caller.
  DOMPurify.addHook('uponSanitizeAttribute', svgAttributePolicy)
  try {
    const output = DOMPurify.sanitize(input, {
      USE_PROFILES: { svg: true, svgFilters: true },
      FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'foreignObject',
        'math', 'annotation-xml'],
      FORBID_ATTR: ['formaction'],
      ALLOW_DATA_ATTR: false,
      ALLOW_UNKNOWN_PROTOCOLS: false,
      // Strip all on-event attributes
      ADD_ATTR: [],
    })
    // `DOMPurify.removed` is a shared mutable array overwritten on every call —
    // snapshot it immediately so the verdict reflects THIS sanitize (#180).
    const removed = [...(DOMPurify.removed as unknown as RemovedEntry[])]
    return { output, report: classifyRemoved(removed) }
  } finally {
    DOMPurify.removeHook('uponSanitizeAttribute')
  }
}

export function sanitizeHtmlSrcdoc(input: string): SanitizeResult {
  const output = DOMPurify.sanitize(input, {
    FORBID_TAGS: ['meta'],
    ALLOW_DATA_ATTR: false,
  })

  const report = createEmptyReport()
  if (/<meta[^>]*http-equiv\s*=\s*['"]refresh/i.test(input) &&
    !/<meta[^>]*http-equiv\s*=\s*['"]refresh/i.test(output)) {
    report.removedScript = true
  }

  return { output, report }
}
