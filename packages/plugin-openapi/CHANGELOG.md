# @usetheo/plugin-openapi changelog

All notable changes to this package will be documented in this file.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) · [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Initial release: Scalar UI mounted at `/api/docs` reading the `.theo/openapi.json` emitted by `theokit build` (G2) or `theokit dev` (P#3 T1.1 dev-emit hook). Zero npm runtime deps on `@scalar/*` — CDN-loaded at runtime.
- Plugin options validated via Zod (strict mode + path-traversal + path-collision + https-only refines).
- `503 OPENAPI_NOT_EMITTED` envelope when `.theo/openapi.json` not yet emitted (graceful empty-state for fresh dev boot).
- `413 OPENAPI_TOO_LARGE` envelope when openapi.json exceeds 10 MB cap (DoS defense for runaway emit).
- `writableEnded` guard on `onRequest` handler — defensive short-circuit when a prior plugin already wrote the response.
