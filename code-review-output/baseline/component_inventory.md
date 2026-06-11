# Component Inventory — theokit-plugins

Generated: 2026-06-11 | Phase 1 (baseline)

## Summary

- **Target kind:** library (collection of framework plugins)
- **Monorepo type:** pnpm workspaces with 11 packages
- **Stack:** TypeScript ESM, tsup build, Vitest tests, Changesets versioning
- **Total source LOC:** 11,141 (98 source files)
- **Total test LOC:** 8,270 (62 test files)
- **Test-to-source ratio:** 0.74

## Packages

### Auth Providers (3 packages)

| Package | Source LOC | Test LOC | Ratio | Entry Points |
|---------|-----------|----------|-------|--------------|
| @theokit/auth-github | 256 | 209 | 0.82 | `.` (server) |
| @theokit/auth-google | 220 | 300 | 1.36 | `.` (server) |
| @theokit/auth-magic-link | 315 | 289 | 0.92 | `.` (server) |

### Framework Plugins (8 packages)

| Package | Source LOC | Test LOC | Ratio | Entry Points |
|---------|-----------|----------|-------|--------------|
| @theokit/plugin-canvas | 3,245 | 2,216 | 0.68 | `.`, `./ui`, `./server` |
| @theokit/plugin-copilot | 1,723 | 1,258 | 0.73 | `.`, `./react` |
| @theokit/plugin-voice | 1,702 | 1,393 | 0.82 | `.`, `./ui` |
| @theokit/plugin-realtime | 1,669 | 726 | 0.43 | `.`, `./react` |
| @theokit/plugin-payments | 639 | 608 | 0.95 | `.` |
| @theokit/plugin-forms | 530 | 314 | 0.59 | `.` |
| @theokit/plugin-email | 522 | 467 | 0.89 | `.` |
| @theokit/plugin-db-drizzle | 320 | 490 | 1.53 | `.` |

## Observations

- **plugin-canvas** is the largest package (3,245 source LOC) with a rich UI layer (renderers for code, diff, HTML, image, markdown, mermaid, slides, SVG, whiteboard).
- **plugin-realtime** has the lowest test-to-source ratio (0.43) — potential test gap.
- **plugin-db-drizzle** has the highest ratio (1.53) — tests exceed source code, suggesting thorough coverage.
- All packages follow a consistent structure: `src/` for source, `tests/` for tests, `tsup.config.ts` + `vitest.config.ts` for tooling.
- Multi-entry-point packages (canvas, copilot, voice, realtime) split server/UI concerns via package.json `exports` field.
