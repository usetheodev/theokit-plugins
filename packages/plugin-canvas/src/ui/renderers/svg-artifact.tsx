import { useMemo } from 'react'

import { sanitizeSvg } from './sanitize.js'
import type { ArtifactRendererProps } from './types.js'

/**
 * SvgArtifact — inline SVG renderer with defence-in-depth sanitisation.
 *
 * The schema layer already rejects the worst cases at ingestion. We
 * sanitise AGAIN here so a tampered-with stored artifact (or one that
 * skipped the boundary) still cannot execute arbitrary JS. The strip
 * report lands in `data-strip-*` attributes for tests + ops visibility.
 *
 * `dangerouslySetInnerHTML` is intentional: SVG is a markup language
 * we want the browser to render, but only after the sanitiser scrubs
 * script / iframe / on-handlers / javascript: URLs.
 */
export function SvgArtifact({ artifact }: ArtifactRendererProps<'svg'>) {
  const { output, report } = useMemo(() => sanitizeSvg(artifact.content), [artifact.content])
  return (
    <div
      data-testid="svg-artifact"
      data-strip-script={report.removedScript ? 'true' : undefined}
      data-strip-onhandler={report.removedOnHandler ? 'true' : undefined}
      data-strip-jsurl={report.removedJsUrl ? 'true' : undefined}
      className="grid place-items-center overflow-auto p-3"
      // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitised above; SVG is a markup language we want rendered
      dangerouslySetInnerHTML={{ __html: output }}
    />
  )
}
