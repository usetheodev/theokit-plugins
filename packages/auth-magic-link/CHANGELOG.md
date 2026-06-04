# Changelog

All notable changes to `@theokit/auth-magic-link` will be documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] — 2026-06-03

### Added

- `magicLink(opts)` factory returns `AuthProvider<MagicLinkProfile, 'magic-link'>` PLUS a `startSignIn(req)` method (magic-link does not use the OAuth `createAuthorizationURL` shape — see README "Wiring").
- 32-byte URL-safe random tokens (43 base64url chars from `crypto.randomBytes`).
- Pluggable `MagicLinkStore` per ADR D7. Two adapters shipped:
  - `createMemoryStore()` — dev/test only. JS event-loop guarantees atomicity for concurrent `consumeToken` calls (EC-11 absorbed).
  - `createOrmStore(repo: MagicLinkRepository)` — production. Atomicity delegated to the Repository contract (UPDATE...RETURNING under the hood for Postgres/MySQL/SQLite).
- Consumer-supplied `sendEmail` callback per ADR D8 — apps wire any transport (Resend, SendGrid, SMTP, console.log for dev). Transport errors propagate (D8 invariant: NEVER swallowed).
- Default token lifetime 15 minutes (configurable via `opts.tokenLifetimeMs`).
- Default `resolveEmail` reads query `?email=` first, then JSON / form-encoded body. Override via `opts.resolveEmail` for custom request shapes.
- Email validation at input boundary (EC-12 absorbed): missing / blank / malformed email throws `MagicLinkConfigError(code: 'invalid_email')` BEFORE token creation.
- Typed errors: `MagicLinkAuthError` (callback-time: `missing_token`, `invalid_or_expired_token`) + `MagicLinkConfigError` (start-time: `invalid_email`, `use_start_sign_in`).
- 15 tests in `tests/magic-link.test.ts`:
  - 5 store tests (isolation, single-use, EC-11 race, cleanup, expiry)
  - 1 ORM integration test (in-memory `MagicLinkRepository` round-trip)
  - 4 startSignIn tests (token shape + persist + email; EC-12 missing/malformed; D8 propagation)
  - 5 handleCallback tests (success, missing_token, unknown, expired, re-use rejection)

### Internal

- `src/sdk-shim.ts` mirrors `AuthProvider<TProfile, TName>` from `@theokit/sdk/server/auth` until SDK 1.6.0 publishes (T5.1). Drop in T5.2.
- Zero runtime deps beyond Node built-ins.
