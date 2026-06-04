# Changelog

All notable changes to `@theokit/auth-google` will be documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] — 2026-06-03

### Added

- `google(opts)` factory returns `AuthProvider<GoogleProfile, 'google'>` compatible with `defineAuth({ providers: [...] })` from `@theokit/sdk/server/auth`.
- OIDC discovery + PKCE (S256) + authorization-code flow + userinfo fetch end-to-end (RFC 6749, RFC 7636, OpenID Connect Core 1.0).
- `GoogleProfile` type with case-sensitive `sub` per ADR D9 (Wasp incident lesson — `sub` is never normalized or lowercased).
- `GoogleProviderOptions.oidcBaseUrl` for overriding discovery base URL (defaults to `https://accounts.google.com`).
- Test-only `MOCK_GOOGLE_OIDC_BASE_URL` env override gated on `NODE_ENV === 'test'` (per plan G11 v1.1 EC-3) — unblocks Playwright sidecar OIDC mock pattern. Production builds (`NODE_ENV !== 'test'`) ignore the env var.
- Typed `GoogleAuthError` with stable `code` field: `missing_pkce_verifier`, `missing_code`, `state_mismatch`, `token_exchange_failed`, `missing_access_token`, `no_userinfo_endpoint`, `userinfo_fetch_failed`, `missing_sub`, `missing_email`.
- 13 tests across two files: 3 scaffold (`tests/scaffold.test.ts`) + 10 provider behavior (`tests/google-provider.test.ts`) including Wasp `sub` case-sensitivity regression, 401 token-exchange error mapping, state-mismatch CSRF guard, and the three EC-3 env-override variants.

### Internal

- `src/sdk-shim.ts` mirrors the `AuthProvider<TProfile, TName>` contract from `@theokit/sdk/server/auth` (SDK 1.6.0, unpublished at scaffold time). Replaced with direct import in T5.2 once SDK 1.6.0 publishes to npm.
- Composes theokit primitives only (`discoverOidcProvider` + `pkceChallengeFromVerifier`) — does NOT reinvent OIDC discovery, PKCE, or state crypto.

### Planned (T5.2)

- Drop `src/sdk-shim.ts`. Switch to `import type { AuthProvider } from '@theokit/sdk/server/auth'`.
- Bump peerDep `@theokit/sdk` to `>=1.6.0`.
- Publish to npm `@next` tag (per ADR D3).
