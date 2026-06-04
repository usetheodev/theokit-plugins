# Changelog

All notable changes to `@theokit/auth-google` will be documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Scaffolded package per plan `g11-auth-architecture-implementation` T2.1: `package.json`, `tsup.config.ts`, `vitest.config.ts`, `tsconfig.json`, `src/index.ts` stub returning `AuthProvider<GoogleProfile, 'google'>` (throws `TODO T2.2`), `src/types.ts` with `GoogleProfile` + `GoogleProviderOptions` (per ADR D9 — case-sensitive `sub`, no lowercasing).
- Local `src/sdk-shim.ts` mirroring `@theokit/sdk/server/auth` `AuthProvider` contract until SDK 1.6.0 publishes (T5.1) — see file header for swap procedure.

### Planned

- T2.2: Concrete Google OIDC flow (discovery + PKCE + token exchange + userinfo fetch). Per plan EC-3, `opts.oidcBaseUrl` + `MOCK_GOOGLE_OIDC_BASE_URL` env override gated on `NODE_ENV === 'test'`.
- T5.2: Drop `sdk-shim.ts`, switch to `import type { AuthProvider } from '@theokit/sdk/server/auth'`, bump peerDep `@theokit/sdk` to `>=1.6.0`.
