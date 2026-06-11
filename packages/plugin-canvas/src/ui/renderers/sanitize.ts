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

/**
 * Classify what DOMPurify removed by comparing input patterns.
 * DOMPurify hooks don't reliably report everything it strips,
 * so we detect removals by checking what was in the input but
 * absent from the output.
 */
function classifyRemovals(input: string, output: string): SanitizeReport {
  const report = createEmptyReport()
  const inLower = input.toLowerCase()
  const outLower = output.toLowerCase()

  if (/<script\b/i.test(input) && !/<script\b/i.test(output))
    report.removedScript = true
  if (/<iframe\b/i.test(input) && !/<iframe\b/i.test(output))
    report.removedIframe = true
  if (/<object\b/i.test(input) && !/<object\b/i.test(output))
    report.removedObject = true
  if (/<embed\b/i.test(input) && !/<embed\b/i.test(output))
    report.removedEmbed = true
  if (/\bon[a-z]+\s*=/i.test(inLower) && !/\bon[a-z]+\s*=/i.test(outLower))
    report.removedOnHandler = true
  // Newline-evaded on-handlers: on\n + event name
  if (/on\s+[a-z]+\s*=/i.test(inLower) && !/on\s+[a-z]+\s*=/i.test(outLower))
    report.removedOnHandler = true
  if (/javascript\s*:/i.test(inLower) && !/javascript\s*:/i.test(outLower))
    report.removedJsUrl = true
  if (/data:(?:text\/html|application\/javascript)/i.test(inLower) &&
    !/data:(?:text\/html|application\/javascript)/i.test(outLower))
    report.removedDataUrl = true

  return report
}

export function sanitizeSvg(input: string): SanitizeResult {
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

  // Post-sanitize: strip any remaining dangerous patterns DOMPurify
  // might have kept (defense in depth)
  let cleaned = output
    // Strip javascript: URIs that survived
    .replace(/(href|src|xlink:href)\s*=\s*"[^"]*javascript:[^"]*"/gi, '')
    .replace(/(href|src|xlink:href)\s*=\s*'[^']*javascript:[^']*'/gi, '')
    // Strip data: URIs for text/html and application/javascript
    .replace(/(href|src|xlink:href)\s*=\s*"[^"]*data:(?:text\/html|application\/javascript)[^"]*"/gi, '')
    .replace(/(href|src|xlink:href)\s*=\s*'[^']*data:(?:text\/html|application\/javascript)[^']*'/gi, '')
    // Strip CSS expression()
    .replace(/expression\s*\([^)]*\)/gi, '')
    // Strip external URLs in <use> xlink:href (allow only fragment refs)
    .replace(/(<use[^>]*(?:href|xlink:href)\s*=\s*")https?:\/\/[^"]*(")/gi, '$1$2')
    .replace(/(<use[^>]*(?:href|xlink:href)\s*=\s*')https?:\/\/[^']*(')/gi, '$1$2')

  const report = classifyRemovals(input, cleaned)
  return { output: cleaned, report }
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
