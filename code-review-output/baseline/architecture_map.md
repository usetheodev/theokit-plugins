# Architecture Map — theokit-plugins

Generated: 2026-06-11 | Phase 1 (baseline)

## Overview

```
theokit-plugins-monorepo (pnpm workspaces)
|
+-- packages/
|   +-- auth-github/          @theokit/auth-github        (OAuth 2.0 provider)
|   +-- auth-google/          @theokit/auth-google         (OIDC provider)
|   +-- auth-magic-link/      @theokit/auth-magic-link     (email token provider)
|   +-- plugin-canvas/        @theokit/plugin-canvas        (artifact protocol + UI)
|   +-- plugin-copilot/       @theokit/plugin-copilot       (AI copilot runtime)
|   +-- plugin-db-drizzle/    @theokit/plugin-db-drizzle    (Drizzle ORM integration)
|   +-- plugin-email/         @theokit/plugin-email          (email sending)
|   +-- plugin-forms/         @theokit/plugin-forms          (form validation + hooks)
|   +-- plugin-payments/      @theokit/plugin-payments       (Stripe payments)
|   +-- plugin-realtime/      @theokit/plugin-realtime       (WebSocket/Yjs rooms)
|   +-- plugin-voice/         @theokit/plugin-voice          (STT + TTS)
```

## Dependency Direction

All packages depend on `@theokit/sdk` (the core framework) via peer dependencies.
Inter-plugin dependencies exist via bridge modules:

- plugin-copilot -> plugin-canvas (canvas-bridge.ts)
- plugin-copilot -> plugin-voice (voice-bridge.ts)
- plugin-copilot -> plugin-realtime (via room bindings)
- auth-magic-link -> plugin-email (optional integration for sending magic-link emails)

## Entry Point Architecture

Each plugin follows the TheoKit plugin shape pattern:
- Factory function (`defineX`, `drizzleDb`, `voicePlugin`) returning a `TheoPlugin` descriptor
- Provider interface (DIP) for extensibility (EmailProvider, RealtimeProvider, AuthProvider)
- Server-only barrel (`.`) and optional client-side barrel (`./ui`, `./react`)

## Build Pipeline

```
TypeScript source -> tsup (ESM, .d.ts) -> dist/
Tests: Vitest
Versioning: Changesets (@changesets/cli)
```
