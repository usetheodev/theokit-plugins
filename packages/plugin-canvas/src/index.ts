/**
 * @theokit/plugin-canvas — artifact protocol + side-panel UI + agent
 * custom tool for emitting rich, renderable outputs from a TheoKit
 * agent surface.
 *
 * The runtime surface is intentionally split into two entry points:
 *
 *   - default barrel (`.`)  — server-side schema + storage + tool sugar
 *   - `./ui` subpath        — browser-only React components + hook
 *
 * Apps mount the renderers via `import { CanvasPanel, useCanvas } from
 * '@theokit/plugin-canvas/ui'` and wire the tool via `import { defineArtifactTool }
 * from '@theokit/plugin-canvas'`. Either side can be tree-shaken when
 * unused.
 */

export {
  artifactSchema,
  artifactEnvelopeSchema,
  ARTIFACT_KINDS,
  validateArtifact,
  isArtifact,
  enforceArtifactSecurity,
  type Artifact,
  type ArtifactKind,
  type ArtifactEnvelope,
  type HtmlSandboxMode,
  type ValidateOptions,
} from './schema.js'

export {
  CanvasPluginError,
  CanvasArtifactValidationError,
  CanvasArtifactNotFoundError,
  CanvasArtifactSecurityError,
} from './errors.js'

export {
  defineArtifactTool,
  type ArtifactToolConfig,
  type ArtifactToolHandlerContext,
  type ArtifactToolResult,
  type DefineArtifactToolOptions,
} from './define-artifact-tool.js'

export {
  createInMemoryArtifactStore,
  createSqliteArtifactStore,
  type ArtifactStore,
  type ArtifactListFilter,
  type CreateSqliteArtifactStoreOptions,
  type SqliteDb,
} from './store.js'

export {
  createArtifactRouteHandlers,
  type ArtifactRouteHandlers,
  type ArtifactRouteHandlerOptions,
} from './route-handlers.js'
