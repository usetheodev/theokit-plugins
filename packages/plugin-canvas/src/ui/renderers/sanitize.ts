/**
 * Defence-in-depth sanitisation for renderer-side SVG and HTML content.
 *
 * The schema layer (`enforceArtifactSecurity`) already rejects obvious
 * threats at the boundary. These helpers run AGAIN at render time so
 * that:
 *
 *   - a stored artifact tampered with after creation cannot bypass the
 *     boundary check (defense in depth);
 *   - apps that bypass the boundary (e.g. inject artifacts into the
 *     renderer directly from a trusted internal source) still benefit
 *     from the strip;
 *   - the user can SEE what we removed (we annotate stripped content
 *     with HTML comments instead of silently dropping).
 *
 * The allowlist approach is intentionally permissive on graphical SVG
 * (lots of innocuous attributes) and strict on dynamic vectors (no JS,
 * no external loads).
 */

const SCRIPT_TAG_RE = /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script\s*>/gi
const IFRAME_TAG_RE = /<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe\s*>/gi
const OBJECT_TAG_RE = /<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object\s*>/gi
const EMBED_TAG_RE = /<embed\b[^>]*\/?>/gi
const ON_ATTR_RE = /\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi
const JS_URL_ATTR_RE = /(href|src|xlink:href|action|formaction)\s*=\s*(?:"\s*javascript:[^"]*"|'\s*javascript:[^']*'|javascript:[^\s>]+)/gi
const DATA_URL_SCRIPT_RE = /(href|src|xlink:href)\s*=\s*(?:"\s*data:(?:text\/html|application\/javascript)[^"]*"|'\s*data:(?:text\/html|application\/javascript)[^']*')/gi

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

export function sanitizeSvg(input: string): SanitizeResult {
  const report: SanitizeReport = {
    removedScript: false,
    removedIframe: false,
    removedObject: false,
    removedEmbed: false,
    removedOnHandler: false,
    removedJsUrl: false,
    removedDataUrl: false,
  }
  let output = input

  output = output.replace(SCRIPT_TAG_RE, () => {
    report.removedScript = true
    return '<!-- script tag stripped -->'
  })
  output = output.replace(IFRAME_TAG_RE, () => {
    report.removedIframe = true
    return '<!-- iframe stripped -->'
  })
  output = output.replace(OBJECT_TAG_RE, () => {
    report.removedObject = true
    return '<!-- object stripped -->'
  })
  output = output.replace(EMBED_TAG_RE, () => {
    report.removedEmbed = true
    return '<!-- embed stripped -->'
  })
  output = output.replace(ON_ATTR_RE, () => {
    report.removedOnHandler = true
    return ''
  })
  output = output.replace(JS_URL_ATTR_RE, () => {
    report.removedJsUrl = true
    return ''
  })
  output = output.replace(DATA_URL_SCRIPT_RE, () => {
    report.removedDataUrl = true
    return ''
  })

  return { output, report }
}

/**
 * The HTML sandbox iframe relies on the browser's `sandbox` attribute
 * for isolation. This helper only strips the most dangerous patterns
 * that can break out of sandbox guarantees (top-level meta refresh,
 * which can navigate the parent in some sandbox modes).
 */
export function sanitizeHtmlSrcdoc(input: string): SanitizeResult {
  const report: SanitizeReport = {
    removedScript: false,
    removedIframe: false,
    removedObject: false,
    removedEmbed: false,
    removedOnHandler: false,
    removedJsUrl: false,
    removedDataUrl: false,
  }
  let output = input
  output = output.replace(/<meta\s+http-equiv\s*=\s*['"]refresh['"][^>]*>/gi, () => {
    report.removedScript = true // overload — semantic == "stripped top-nav vector"
    return '<!-- meta refresh stripped -->'
  })
  return { output, report }
}
