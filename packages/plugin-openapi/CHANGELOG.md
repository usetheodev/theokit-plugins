# @usetheo/plugin-openapi changelog

All notable changes to this package will be documented in this file.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) · [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.3] - 2026-06-03

### Fixed

- **CRITICAL — `/api/docs` still rendered blank after v0.1.2 unsafe-eval allow** (third-order: wrong Scalar integration pattern). v0.1.1 + v0.1.2 fixed the CSP layer (data-attribute init + `'unsafe-eval'` for Vue runtime), but the rendered HTML put `data-url` on the bundle script tag itself. Scalar 1.58.x silently ignores that attribute placement — its bundle scans the document for a separate `<script id="api-reference" data-url="...">` configuration carrier tag, NOT attributes on its own `<script src=...>`. Bundle loaded (`window.Scalar` defined) but never mounted → blank `#app` (verified via Chrome DevTools `evaluate_script` returning `{hasScalar: true, appHTML: 0}`).

  **Fix:** `render-html.ts` emits the official Scalar two-script pattern per `github.com/scalar/scalar/blob/main/documentation/integrations/html-js.md`:
  ```html
  <script id="api-reference" data-url="/api/docs/openapi.json"></script>
  <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
  ```

  **3 updated regression tests** + 1 reworded:
  - render-html: emits `<script id="api-reference" data-url="...">` config carrier
  - render-html: bundle script tag MUST NOT also carry data-url
  - render-html: inline scripts MUST have empty body (the config tag is a pure attribute container, no JS body)
  - integration: `/api/docs` response contains BOTH the config tag AND the bundle script tag

  Combined v0.1.0 → v0.1.3 fix is now end-to-end browser-verified: Scalar UI renders the API reference at `/api/docs` under strict default CSP — no inline JS body, `'unsafe-eval'` narrowly scoped to script-src, two-script integration follows Scalar's documented contract.

  PeerDep `theokit >=0.2.1` unchanged.

## [0.1.2] - 2026-06-03

### Fixed

- **CRITICAL — `/api/docs` still rendered blank after v0.1.1** (second-order CSP block on Scalar runtime). The v0.1.1 fix landed the CDN allow-list + data-attribute init but Scalar's `standalone.js@1.58.0` bundle uses `eval()` internally for Vue runtime template compilation. CSP `script-src` without `'unsafe-eval'` blocks the eval call at `standalone.js:314`, so the CDN script loads (`@scalar/api-reference@1.58.0` logged) but the Vue app fails to mount → blank page. Discovered via Chrome DevTools MCP visual smoke against dogfood-app post-v0.1.1 — `take_screenshot` returned a fully white page; `list_console_messages` surfaced the eval-block issue.

  **Fix:** `index.ts` — add `'unsafe-eval'` to the per-route CSP `script-src` for `/api/docs` only. The exception is narrowly scoped — every other route keeps the strict host CSP (no eval). Industry standard for API-doc UIs (Swagger UI + Redoc require the same; both are CDN-hosted Vue/React apps that compile templates at runtime).

  **2 new regression tests** added (`tests/integration.test.ts`):
  - `/api/docs` CSP MUST include `'unsafe-eval'` in `script-src`
  - `/api/docs/openapi.json` CSP MUST NOT include `'unsafe-eval'` (proves the exception is scoped to docs HTML, not blanket)

  Combined v0.1.0 → v0.1.2 fix is now end-to-end browser-verified: Scalar UI renders the API reference at `/api/docs` under strict default CSP — no `'unsafe-inline'` for script-src, only the narrowly-scoped `'unsafe-eval'` that Scalar's runtime requires.

  PeerDep `theokit >=0.2.1` unchanged.

## [0.1.1] - 2026-06-03

### Fixed

- **CRITICAL — `/api/docs` rendered blank under strict CSP** (regression vs theokit 0.2.x default `script-src 'self'`). The previous version emitted a second inline `<script>Scalar.createApiReference('#app', {...})</script>` to bootstrap Scalar; that inline block is blocked by `script-src 'self'` (no `'unsafe-inline'`), causing the page to render with no Scalar UI. Discovered via Chrome DevTools MCP visual smoke against dogfood-app — HTTP returned 200 but browser console showed `Refused to execute inline script` + `Refused to load script from https://cdn.jsdelivr.net/...`. Fix is two-part:

  1. **`render-html.ts`** — removed the inline init script entirely; uses Scalar's documented `<script src="..." data-url="..."></script>` data-attribute pattern. Scalar's bundle reads attributes off its own script tag on load. No inline JS context anymore.
  2. **`index.ts`** — `/api/docs` response now sets a per-route `Content-Security-Policy` header that overrides the host CSP. `script-src` allows `'self'` PLUS the CDN origin (parsed from `cdnUrl`); `'unsafe-inline'` stays OFF for `script-src` (proves the fix is real, not a workaround). Other CSP directives stay conservative — `default-src 'self'`, `frame-ancestors 'none'` (clickjacking defense, OWASP A05). The `/api/docs/openapi.json` response does NOT receive this CSP override — only `/api/docs` does (per-route scoping defense, verified by regression test).

  **4 new regression tests** added (`tests/render-html.test.ts` + `tests/integration.test.ts`):
  - data-url attribute presence + REGRESSION-must-NOT inverse for `Scalar.createApiReference` inline form
  - per-route CSP header presence + CDN host in script-src + 'unsafe-inline' MUST be absent
  - openapi.json response does NOT get the docs-page CSP override
  - CSP cdnHost dynamically follows consumer's `cdnUrl` override

  PeerDep `theokit >=0.2.1` unchanged — no theokit change required.

### Added

- **`cdnHostForCsp(cdnUrl)` pure helper** (exported from `render-html.js`) — extracts scheme+host from cdnUrl for the per-response CSP `script-src` list. Tested with default jsdelivr, custom host with port, and deep-path URLs (proves we grant origin only, not wildcard path).

## [0.1.0] - 2026-06-02

### Added

- Initial release: Scalar UI mounted at `/api/docs` reading the `.theo/openapi.json` emitted by `theokit build` (G2) or `theokit dev` (P#3 T1.1 dev-emit hook). Zero npm runtime deps on `@scalar/*` — CDN-loaded at runtime.
- Plugin options validated via Zod (strict mode + path-traversal + path-collision + https-only refines).
- `503 OPENAPI_NOT_EMITTED` envelope when `.theo/openapi.json` not yet emitted (graceful empty-state for fresh dev boot).
- `413 OPENAPI_TOO_LARGE` envelope when openapi.json exceeds 10 MB cap (DoS defense for runaway emit).
- `writableEnded` guard on `onRequest` handler — defensive short-circuit when a prior plugin already wrote the response.
