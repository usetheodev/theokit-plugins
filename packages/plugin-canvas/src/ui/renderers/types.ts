import type { Artifact, ArtifactKind } from '../../schema.js'

/**
 * Common prop shape for per-kind renderers. The generic parameter
 * narrows the `artifact` field to the matching variant so renderers
 * never need to `switch` on `kind` themselves.
 */
export interface ArtifactRendererProps<K extends ArtifactKind = ArtifactKind> {
  artifact: Extract<Artifact, { kind: K }>
}

/**
 * Renderer registry entry — apps register custom renderers via
 * `<ArtifactRenderer renderers={{ kind: Component, … }}>`. Unknown
 * kinds fall back to a generic JSON dump (visible warning).
 */
export type ArtifactRendererComponent<K extends ArtifactKind = ArtifactKind> = (
  props: ArtifactRendererProps<K>,
) => React.ReactElement | null

export type ArtifactRendererRegistry = {
  [K in ArtifactKind]?: ArtifactRendererComponent<K>
}
