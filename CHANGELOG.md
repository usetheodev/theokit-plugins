# Changelog

Workspace-level changes for the `theokit-plugins` monorepo. Per-package changes live in each `packages/plugin-*/CHANGELOG.md` (auto-managed by Changesets).

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this repo adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Code review audit (2026-06-16) of all 11 `@theokit/*` packages — 72 findings (1 critical, 26 high, 34 medium, 11 low) in `code-review-output/final_report.md`
- Remediation plan for all 72 findings — `knowledge-base/plans/remediate-code-review-2026-06-16-plan.md` (verdict SHIPPABLE 96.8) + edge-case review

### Changed

- plugin-canvas: removed a no-op `try/catch` around the agent-tool security gate (internal cleanup, no behavior change) (#181)
- plugin-payments: `payments()` now logs a loud warning when it falls back to the default in-memory idempotency store under `NODE_ENV=production` — that store is not multi-replica safe; pass an explicit `idempotencyStore` in production (#202)

### Removed

- Stale prior-run review artifacts from `code-review-output/` (2026-06-11 phase reports + figures superseded by the 2026-06-16 audit)

### Fixed

- plugin-voice: `<VoiceRecorderBar>` now guards the STT success-response JSON parse — a malformed (non-JSON) 200 body surfaces a specific `VoicePluginError` ("Invalid STT response…") via `onError` instead of throwing an opaque `SyntaxError` (#217)
- plugin-voice: `useTts` no longer lets a stale `speak()` whose `audio.play()` resolves late override a newer `speak()`/`stop()`. Each call captures its own controller and, after every await, bails when it is no longer the active call — tearing down only its own audio/blob URL/listeners instead of clobbering the newer call's state (#216)
- plugin-voice: the TTS `voice` option is now validated against a single shared enum (`alloy`/`echo`/`fable`/`onyx`/`nova`/`shimmer`) at construction, so a misconfigured default voice fails fast instead of diverging from the server's runtime check and only surfacing as a 400 on the first request. The server's per-request voice validation now derives from the same source of truth (#215)
- plugin-voice: a `MediaRecorder` error that fires while recording (with no `stop()` in flight) now always releases the media stream and is surfaced via a new `onError` recorder option, instead of being silently dropped with the microphone stream left open (#213)
- plugin-voice: the STT and TTS server handlers now bound the upstream provider call with a timeout (default 30s, configurable via `timeoutMs`) and accept a client `signal`, so a stalled provider no longer hangs the handler indefinitely — a timeout or client abort returns `504 UPSTREAM_TIMEOUT` instead. Passing the signal to the real `fetch` also cancels the TTS streamed body when the client disconnects mid-stream (#211, #212)
- plugin-realtime: concurrent `applyYjsUpdate`/`applyYjsAwareness` calls on a fresh room now share a single `Y.Doc` via an in-flight single-flight memo, fixing a check-then-act race that orphaned a duplicate `Y.Doc` (and its `Awareness`); a failed doc init clears the memo so a later call can recreate it (no permanently bricked room). The redundant second `loadYjs()` per apply is removed — `ensureYjs` now returns the loaded modules in its bundle (#193, #196)
- plugin-realtime: a room declared with `storage: "yjs"` wired to a provider that does not implement Yjs (`applyYjsUpdate`/`applyYjsAwareness`, e.g. the in-memory provider) now throws a `RealtimeError` (`yjs_provider_unsupported`) when a Yjs frame is dispatched, instead of silently dropping it and losing document state. Rooms without `storage: "yjs"` are unaffected — a stray Yjs frame is still a no-op (#197)
- plugin-realtime: a subscription that is aborted mid-stream now reliably releases its connection handle and abort listener instead of leaking them — the abort listener is registered before the connection await (and an already-aborted signal is honored up front), so an abort during connection setup is no longer missed. The per-subscription frame buffer is now bounded: a consumer that cannot keep up is disconnected (close 1013) rather than letting the server buffer grow without limit, and no frames are buffered after abort (#195, #198)
- plugin-realtime: a Yjs update can no longer be applied to a destroyed/garbage-collected `Y.Doc`. In-flight applies now hold a per-room refcount that defers room teardown until they finish, so a concurrent `leaveRoom` can't destroy the doc mid-apply; an apply that races room eviction is a safe no-op. This also closes a doc leak where a room garbage-collected while its doc was still initializing left the `Y.Doc` orphaned (never destroyed) (#194)
- auth-github: a failed `/user/emails` fetch is now surfaced as a typed `GitHubAuthError` (`emails_fetch_failed`) instead of being silently swallowed into a null-email identity. This only fires when the `user:email` scope was granted and `/user` returned no email — a genuinely email-less account (endpoint OK, no verified address) still resolves to a documented null, distinct from a fetch failure (#203)
- auth-magic-link: the default email resolver caps the buffered request body (16 KB) to prevent a large-POST DoS (#204) and narrows error handling so transport/stream errors propagate instead of being swallowed (#209); the callback URL is built via the URL API (no double slash) and `magicLink()` validates `callbackBaseUrl` at construction (#205)
- plugin-payments: the Stripe client now validates `apiVersion` against the SDK's accepted set at runtime and throws `StripeApiVersionError` on an unsupported value, instead of blind-casting it past the type system — so a JS consumer can no longer silently send an unsupported version to Stripe (#210)
- plugin-payments: webhook dispatch now aggregates every failed handler's error into a single `AggregateError` (instead of throwing only the first and losing the rest to a log), and `processWebhook` returns a **sanitized** `{code,message}` error at the HTTP boundary while logging the full error server-side with secrets redacted — closing a PII/secret leak (#201) and a lost-errors gap (#208). `WebhookResult.error` shape narrowed (see changeset)
- plugin-payments: webhook events are now claimed before dispatch and **released on handler failure** so Stripe's retry re-runs a failed handler instead of silently deduping it — restoring exactly-once-on-success + retry-on-failure (previously a thrown handler left the event marked, dropping it permanently). `IdempotencyStore` gains a required `release()` and `IdempotencyRepository` a required `delete()`; webhook handlers must be idempotent (#167)
- plugin-payments: `formatAmountForStripe` now detects zero-decimal currencies from Stripe's published currency set keyed on the ISO code (not amount/locale-dependent `Intl` introspection) and scales to minor units with integer-exact arithmetic — fixing a 100x undercharge for codes like ISK/HUF/UGX, a 10x undercharge for 3-decimal currencies (BHD/KWD/…), and a binary-float rounding error (e.g. 1.005 USD). Non-finite/negative/overflowing amounts now fail loudly (#199, #200)

### Security

- plugin-voice: the STT and TTS handlers no longer reflect the raw upstream provider error body to the client (which could leak provider internals). The body is now logged server-side under a correlation id, and the client receives a generic message with that same id for support correlation (#214)
- auth-google: the OIDC flow now refuses any non-`https` URL it would fetch — the discovery base, and the discovered `authorization_endpoint`, `token_endpoint`, and `userinfo_endpoint` — with a loopback (`localhost`/`127.0.0.0/8`/`::1`) carve-out for local test sidecars. The `MOCK_GOOGLE_OIDC_BASE_URL` test override is now honored only when it targets a loopback host, so a leaked `NODE_ENV=test` can no longer redirect the credential-bearing token exchange to an attacker, closing an SSRF that could exfiltrate `client_secret` + auth code. Note: the audit's prescribed "discovered endpoint host must equal the base host" check was deliberately **not** adopted — Google's real discovery spans `accounts.google.com`/`oauth2.googleapis.com`/`openidconnect.googleapis.com`, so host-equality would break production; the https-except-loopback rule closes the same plaintext-exfil vector without that breakage (#192)
- auth-magic-link: magic-link tokens are now hashed (SHA-256) at rest in the built-in memory and ORM stores, so a store/DB/log leak no longer exposes live credentials (#191). Also documents that magic-link tokens are intentionally unbound bearer credentials — cross-device by design — relying on token entropy + short TTL + single-use + hash-at-rest rather than OAuth `tx.state` binding (#190; supersedes plan ADR D6)
- plugin-canvas: enforce artifact security on the REST `POST /artifacts` route — script-bearing SVG and meta-refresh HTML are now rejected with 400 before persistence, closing a stored-XSS bypass that previously only guarded the agent-tool path (#176)
- plugin-canvas: the artifact security gate now also covers `image` (`data:image/svg+xml`), `mermaid`, and `slide-deck` kinds — SVG data URLs are decoded and sanitized (malformed base64 rejected cleanly), and mermaid/slide-deck sources are scanned for script vectors (#178)
- plugin-canvas: the mermaid renderer now sanitizes the rendered SVG (DOMPurify) before injecting it into the DOM, adding defense-in-depth on top of mermaid's `securityLevel:'strict'` (#177)
- plugin-canvas: the SVG sanitizer now derives its removal verdict from DOMPurify's reported removals (not an input/output regex diff) and drops the post-sanitize regex pass — fixing a false rejection of valid `https` URLs that merely contained `javascript:` in a query string, and an inaccurate `removedJsUrl` verdict (#179, #180)

## [0.1.0] - 2026-06-11

### Added

- Code review report covering all 11 packages — 166 findings across 182 files (`code-review-output/REVIEW-REPORT.md`)
- Implementation plan to remediate all 23 blocking findings (`knowledge-base/plans/fix-code-review-findings-plan.md`)
- DOMPurify-based SVG/HTML sanitization in plugin-canvas, replacing regex-based approach (OWASP recommendation)
- Resend provider test suite (`packages/plugin-email/tests/resend-provider.test.ts`)
- Budget bridge calendar-month test suite (`packages/plugin-copilot/tests/budget-bridge.test.ts`)
- Initial monorepo scaffold — `pnpm-workspace.yaml` + `tsconfig.base.json` + ESLint + Prettier + Changesets + CI workflows

### Changed

- Bump `@theokit/ui` peer dependency to `^0.14.2` in plugin-canvas, plugin-copilot, and plugin-forms
- plugin-copilot: `CopilotAgentConfig.apiKey` now accepts `string | (() => string)` for lazy key resolution
- plugin-payments: `WebhookRegistry.dispatch()` now runs all handlers even when one throws (first error rethrown, subsequent logged)
- plugin-voice README updated to reflect v0.7.0 capabilities; removed false auto-endpoint claim
- plugin-realtime README documents `useBroadcast`/`updateMyPresence` as local-only in v0.1

### Fixed

- plugin-canvas: SQL injection via unvalidated table name in `createSqliteArtifactStore` — now validated against `/^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/`
- plugin-canvas: SVG sanitizer bypass vectors (foreignObject, CSS expression, case-mixed javascript: URIs, external xlink:href)
- plugin-canvas: 500 error responses no longer leak internal error messages
- plugin-canvas: `onAfterInsert` side-effect errors now logged instead of silently swallowed
- plugin-canvas: invalid `kind` query param now returns 400 instead of unchecked type assertion
- plugin-copilot: race condition in `CopilotRuntime.handleFrame` — concurrent calls now serialized per-registration
- plugin-copilot: `deactivate()` now drains pending frame queue before leaving room
- plugin-copilot: `BudgetBridge` uses calendar month boundaries instead of fixed 30-day window
- plugin-copilot: agent errors in `runAgent` now propagated to callers after broadcast
- plugin-db-drizzle: devtools iframe now sandboxed (`allow-scripts allow-same-origin`)
- plugin-email: `ResendProvider.send` preserves error cause chain from Resend API
- plugin-forms: non-`ActionInputError` exceptions in `TheoForm` `onSuccess` now rethrown
- plugin-payments: webhook handler errors no longer block subsequent handlers
- plugin-realtime: listener errors in fanout loops now logged instead of silently swallowed
- plugin-realtime: mermaid and Yjs lazy loaders use single-flight pattern (no concurrent double-init, no permanent error cache)
