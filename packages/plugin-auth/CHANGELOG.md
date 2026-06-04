# Changelog

All notable changes to `@theokit/plugin-auth` will be documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] — 2026-06-03

### Added

- Meta-package bundling three Tier-1 auth providers: `@theokit/auth-google`, `@theokit/auth-github`, `@theokit/auth-magic-link` (one `pnpm add` instead of three).
- Re-exports: `google`, `github`, `magicLink` factories; `createMemoryStore`, `createOrmStore`; `GoogleAuthError`, `GitHubAuthError`, `MagicLinkAuthError`, `MagicLinkConfigError`; all per-provider profile + options types.
- `createSaasAuth(opts)` convenience helper that wraps `defineAuth` (from `@theokit/sdk/server/auth`) with SAAS-shaped defaults. Lazy dynamic-import of the SDK so this package ships BEFORE SDK 1.6.0 lands on npm (per plan T5 ordering).
- 6 re-export integrity tests in `tests/meta.test.ts` covering: factory identity (`meta.google === authGoogle.google`), error class identity, lazy-load fallback emits honest error when SDK 1.5.0 is the active resolution.

### Internal

- `src/sdk-shim.ts` mirrors `AuthProvider<TProfile, TName>` for the local-typed `CreateSaasAuthOptions` surface. Drop in T5.2.
- `createSaasAuth` uses `dynImport(specifier)` (computed string) to dodge bundler static-resolve attempts against SDK 1.5.0. Collapses to `import { defineAuth } from "@theokit/sdk/server/auth"` post-T5.2.

### Planned

- T5.2: publish to npm `@next` alongside the three auth-* packages.
- Post-SDK 1.6.0 promote (T9.4): drop sdk-shim, switch to static import, bump peerDep `@theokit/sdk` to `>=1.6.0`, retag `@latest`.
