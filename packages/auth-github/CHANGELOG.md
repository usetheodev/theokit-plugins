# Changelog

All notable changes to `@theokit/auth-github` will be documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] — 2026-06-03

### Added

- `github(opts)` factory returns `AuthProvider<GitHubProfile, 'github'>` compatible with `defineAuth({ providers: [...] })`.
- OAuth 2.0 authorization-code flow (no OIDC discovery; no PKCE — GitHub does not implement RFC 7636). CSRF defense via `state` per RFC 6749 §10.12.
- Hardcoded endpoints overridable via `opts.authorizationEndpoint` / `tokenEndpoint` / `userinfoEndpoint` / `userEmailsEndpoint` (GitHub Enterprise Server support).
- Conditional `/user/emails` second fetch when `scopes` include `user:email` and `/user.email` is null — picks the primary verified email per Wasp blueprint Q1 pattern.
- `GitHubProfile.id` preserved as `number` (ADR D9 — no type coercion).
- `Authorization: token <X>` header for userinfo (NOT `Bearer X`) per GitHub REST API docs.
- Typed `GitHubAuthError` with stable `code` field (7 codes): `missing_code`, `state_mismatch`, `token_exchange_failed`, `missing_access_token`, `userinfo_fetch_failed`, `missing_id`, `missing_login`.
- 11 tests in `tests/github-provider.test.ts` covering all plan TDD checklist items + 2 extra (state-mismatch CSRF, token-exchange Accept header).

### Internal

- `src/sdk-shim.ts` mirrors `AuthProvider<TProfile, TName>` from `@theokit/sdk/server/auth` until SDK 1.6.0 publishes (T5.1). Drop in T5.2.
- Zero crypto in this package; no theokit primitives imported (GitHub flow needs no PKCE/OIDC, so the dependency surface is smaller than `@theokit/auth-google`).
