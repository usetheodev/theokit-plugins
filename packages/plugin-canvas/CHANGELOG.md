# Changelog

All notable changes to `@usetheo/plugin-canvas` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.0] - 2026-05-31

> First GA release of the canvas plugin. Promotes `0.3.0-next.0` to stable. The BREAKING change against `@usetheo/ui >= 0.13.0` listed below was already shipped in `0.3.0-next.0`; no further API changes.

### Added
- `createArtifactBus()` exported from `@usetheo/plugin-canvas/server` subpath — process-local pub/sub for SSE-driven artifact emit. Replaces ad-hoc bus wiring in consumer apps (canvas-ecosystem-refactor-plan T3.1)
- Server subpath `@usetheo/plugin-canvas/server` — first server-side entrypoint, paving the way for additional server helpers (cost adapters, route presets) in future versions

### Changed
- **BREAKING:** `@usetheo/ui` is now a **required** peer dependency (`>= 0.13.0`). Previously optional. Plugin UI components (CanvasPanel, OpenInCanvasButton, ArtifactVersionRail, code/diff/mermaid renderers) now consume `Button`, `Card`, `CopyButton`, `EmptyState`, `ScrollArea`, `Tooltip`, `Alert`, `DropdownMenu`, `CodeBlock`, `DiffViewer` primitives directly instead of raw HTML elements (D1 of canvas-ecosystem-refactor-plan)
- Plugin UI now inherits design tokens, theming, focus rings, and a11y from `@usetheo/ui` — no more divergent button styles between plugin and host app
- `OpenInCanvasButton` keyboard nav improved — Radix `DropdownMenu` adds arrow-key navigation, Esc-to-close, and focus trap for free
- `CodeArtifact` now renders via `CodeBlock` composite (syntax highlighting via Shiki) for non-terminal code; terminal code keeps raw `<pre>` for unstyled monospace output
- `DiffArtifact` now delegates to `DiffViewer` primitive
- `MermaidArtifact` fallback now uses `CodeBlock` (language="mermaid") instead of raw `<pre>`

### Fixed
- N/A

## [0.2.0] - 2026-05-30

### Added
- Initial release — 9 artifact kinds (markdown/code/svg/diff/whiteboard-scene/slide-deck/mermaid/html/image), SQLite + in-memory artifact stores, `defineArtifactTool` agent helper, `CanvasPanel` + `ArtifactRenderer` + `useCanvas` hook
- Lazy peer imports for `@usetheo/ui/whiteboard` and `@usetheo/ui/slide-deck`
- Defense-in-depth security: schema-level byte caps + render-time SVG/HTML sanitization
