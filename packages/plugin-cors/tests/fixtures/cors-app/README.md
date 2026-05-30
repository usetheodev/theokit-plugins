# Fixture — cors-app

Minimal TheoKit app demonstrating `@usetheo/plugin-cors` wired into `theo.config.ts > plugins[]` (T3.1).

## Layout

- `theo.config.ts` — imports `corsPlugin` and passes a typical configuration (allowlist origin, credentials, custom methods/headers)
- `server/routes/health.ts` — a trivial `GET /health` route exercised by the integration test

## Purpose

The fixture proves that:

1. `@usetheo/plugin-cors` integrates with the TheoKit boot path (`defineConfig` accepts the plugin in the `plugins[]` array)
2. The plugin shape (`{ name, register }`) survives the round-trip through `defineConfig`'s normalization
3. Construction-time validation runs at config load (W3C invalid combos fail-fast)

## Cross-repo workspace (ADR D7)

This fixture imports `from 'theokit'` and `from 'theokit/server'` via the `link:` devDependency declared in the plugin's `package.json`. Sibling tolerance: if the TheoKit core repo isn't cloned, pnpm warns but doesn't fail.

## Running

The fixture is exercised by `../fixture.test.ts` and `../integration.test.ts` — there is no standalone runner.
