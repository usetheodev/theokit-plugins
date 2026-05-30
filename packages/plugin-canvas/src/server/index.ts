/**
 * Server-side entrypoint of `@usetheo/plugin-canvas`.
 *
 * Import via:
 *
 *     import { createArtifactBus } from '@usetheo/plugin-canvas/server'
 *
 * Re-exports only server-safe modules — never pulls React UI.
 */

export {
  createArtifactBus,
  type ArtifactBus,
  type ArtifactBusHandler,
} from './artifact-bus.js'
