import { useMemo } from 'react'

import { sanitizeHtmlSrcdoc } from './sanitize.js'
import type { ArtifactRendererProps } from './types.js'

const SANDBOX_MAP: Record<'minimal' | 'scripts' | 'forms', string> = {
  // Empty string is the most restrictive `sandbox=""` (no scripts,
  // no same-origin, no popups, no top-navigation). React treats `""` as
  // the empty-attribute equivalent.
  minimal: '',
  scripts: 'allow-scripts',
  // `allow-scripts allow-forms` is the highest level we offer.
  // `allow-same-origin` is NEVER mapped — combining it with
  // `allow-scripts` defeats the sandbox.
  forms: 'allow-scripts allow-forms',
}

/**
 * HtmlArtifact — sandboxed iframe carrying the artifact's `srcdoc`.
 *
 * Security:
 *   - the iframe `sandbox` attribute is the primary isolation; we map
 *     the schema's enum (`minimal | scripts | forms`) to a closed set
 *     of allow-tokens. `allow-same-origin` is never granted, even
 *     under `forms`, so the iframe cannot escape into the parent's
 *     storage / cookies / DOM.
 *   - srcdoc is re-sanitised at render time (strip `<meta http-equiv="refresh">`).
 *   - `referrerpolicy="no-referrer"` so the iframe cannot leak the
 *     parent's URL to embedded resources.
 *   - `loading="lazy"` so iframes off-viewport do not start work.
 *
 * The component does NOT auto-resize the iframe; consumers control the
 * outer `<CanvasPanel>` size. A min-height keeps the surface non-zero.
 */
export function HtmlArtifact({ artifact }: ArtifactRendererProps<'html'>) {
  const { output } = useMemo(() => sanitizeHtmlSrcdoc(artifact.srcdoc), [artifact.srcdoc])
  const sandbox = SANDBOX_MAP[artifact.sandbox]
  return (
    <div data-testid="html-artifact" className="grid h-full p-3">
      <iframe
        title={artifact.title}
        // biome-ignore lint/a11y/useIframeTitle: title prop is supplied above
        sandbox={sandbox}
        referrerPolicy="no-referrer"
        loading="lazy"
        srcDoc={output}
        data-sandbox={artifact.sandbox}
        className="min-h-[300px] w-full rounded-md border bg-white"
      />
    </div>
  )
}
