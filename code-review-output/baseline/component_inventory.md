# Component Inventory — theokit-plugins

| Component | Kind | Path | Lang | Src LOC | Notes |
|---|---|---|---|---|---|
| cycle-harness | layer | `.claude/skills` | python | 12574 | Development cycle harness skills (plan/discover/implement/review/code-quality). Sampled — meta-tooling, not shipped product. |
| plugin-canvas | module | `packages/plugin-canvas/src` | typescript | 3475 | Artifact canvas: route-handlers, artifact bus, HTML sanitization (DOMPurify). XSS-critical surface. |
| plugin-copilot | module | `packages/plugin-copilot/src` | typescript | 1764 | AI copilot: agent room member, trigger-evaluator, canvas/voice/budget bridges, runtime. |
| plugin-voice | module | `packages/plugin-voice/src` | typescript | 1714 | Voice: STT server, TTS server, recorder, use-tts hook. External-I/O + streaming. |
| plugin-realtime | module | `packages/plugin-realtime/src` | typescript | 1685 | Realtime collaboration: yjs provider, room definition, memory provider, server integration. Concurrency-critical. |
| repo-scripts | service | `.claude/scripts` | python | 951 | Repo-level validation/xref scripts (check_xrefs, e2e smoke). |
| repo-automation | service | `.claude/hooks` | shell | 844 | Repo Git/session hooks (stop-validation, public-copy-lint, session hooks). Shell. |
| plugin-payments | module | `packages/plugin-payments/src` | typescript | 665 | Stripe payments: checkout, webhook signature verify, idempotency store, currency math. Money/security-critical. |
| plugin-forms | module | `packages/plugin-forms/src` | typescript | 540 | Form handling: useTheoField hook, action-error adapter. |
| plugin-email | module | `packages/plugin-email/src` | typescript | 529 | Email: Resend provider, templates, magic-link email, react-email render. |
| plugin-db-drizzle | module | `packages/plugin-db-drizzle/src` | typescript | 326 | Drizzle DB integration: options, devtools, CLI migrations. |
| auth-magic-link | module | `packages/auth-magic-link/src` | typescript | 318 | Magic-link auth: token generation/verification + store. Security-critical (token entropy, expiry, single-use). |
| auth-github | module | `packages/auth-github/src` | typescript | 225 | OAuth2 GitHub provider: authorize URL, code->token exchange, user fetch. Security-critical (CSRF state, token handling). |
| auth-google | module | `packages/auth-google/src` | typescript | 222 | OAuth2 Google provider: OIDC flow, token exchange, id_token handling. Security-critical. |
