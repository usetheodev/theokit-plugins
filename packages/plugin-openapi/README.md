# @usetheo/plugin-openapi

> OpenAPI docs UI for TheoKit. Mounts [Scalar](https://github.com/scalar/scalar) at `/api/docs` reading the `.theo/openapi.json` emitted by `theokit build` (or `theokit dev` after P#3 ships).

Zero npm runtime deps on `@scalar/*` — the UI loads from `https://cdn.jsdelivr.net/npm/@scalar/api-reference` at request time in the browser. Consumer-app bundle delta: **0 bytes**.

## Install

```bash
pnpm add @usetheo/plugin-openapi
```

Requires `theokit >= 0.2.2` (peerDep). Earlier theokit versions don't emit `.theo/openapi.json` automatically in dev mode.

## Quickstart

In your `theo.config.ts`:

```ts
import { defineConfig } from 'theokit'
import openApiPlugin from '@usetheo/plugin-openapi'

export default defineConfig({
  // Opt into G2's OpenAPI emit
  openapi: {
    title: 'My App',
    version: '1.0.0',
    servers: [{ url: 'http://localhost:3000' }],
  },
  // Mount the UI
  plugins: [openApiPlugin()],
})
```

Then `pnpm dev` and open [http://localhost:3000/api/docs](http://localhost:3000/api/docs).

## Options

```ts
openApiPlugin({
  docsPath: '/api/docs',                    // HTML page path
  openapiJsonPath: '/api/docs/openapi.json', // JSON served from disk
  openapiSourcePath: '.theo/openapi.json',  // on-disk emit location
  cdnUrl: 'https://cdn.jsdelivr.net/npm/@scalar/api-reference',
  pageTitle: 'API Reference',
})
```

## Offline mode

The default loads Scalar from jsdelivr CDN. For air-gapped deployments, host the Scalar bundle yourself and override `cdnUrl`:

```ts
openApiPlugin({
  cdnUrl: '/static/scalar/api-reference.js',
})
```

See [Scalar's CDN docs](https://github.com/scalar/scalar/blob/main/documentation/integrations/html-js.md) for the standalone bundle layout.

## How it works

1. **`theokit dev` / `theokit build`** emits `.theo/openapi.json` (or `dist/openapi.json` for prod) when `config.openapi` is defined (G2 feature, P#3 dev hook).
2. **`GET /api/docs`** → plugin serves HTML referencing Scalar's CDN script.
3. **`GET /api/docs/openapi.json`** → plugin reads the on-disk file + serves as `application/json` (or `503 OPENAPI_NOT_EMITTED` if absent).

## License

MIT
