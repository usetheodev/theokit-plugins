/**
 * @theokit/plugin-auth v0.1.0 — meta-package bundling the 3 Tier-1 auth providers
 * + the `createSaasAuth` convenience helper.
 *
 * Per plan g11-auth-architecture-implementation Phase 7 (P#1 meta-package).
 *
 * What this package adds beyond importing each auth-* directly:
 *   - 1 install vs 3 (`pnpm add @theokit/plugin-auth` pulls everything).
 *   - `createSaasAuth({ session, providers, onSignIn })` wraps `defineAuth` with
 *     SAAS-shaped defaults (cookie session manager, sensible callback paths).
 *
 * Apps wanting a smaller surface should install ONLY the specific
 * @theokit/auth-* package they need.
 */

// Re-exports — the consumer surface
export { google } from "@theokit/auth-google";
export type { GoogleProfile, GoogleProviderOptions } from "@theokit/auth-google";
export { GoogleAuthError } from "@theokit/auth-google";

export { github } from "@theokit/auth-github";
export type { GitHubProfile, GitHubProviderOptions } from "@theokit/auth-github";
export { GitHubAuthError } from "@theokit/auth-github";

export {
  magicLink,
  createMemoryStore,
  createOrmStore,
  MagicLinkAuthError,
  MagicLinkConfigError,
} from "@theokit/auth-magic-link";
export type {
  MagicLinkProfile,
  MagicLinkProviderOptions,
  MagicLinkStore,
  MagicLinkTokenRecord,
  MagicLinkRepository,
  SendMagicLinkFn,
} from "@theokit/auth-magic-link";

// createSaasAuth — convenience helper. Wraps defineAuth with SAAS-shaped defaults.

import type {
  AuthOrchestrator,
  AuthProvider,
  DefineAuthOptions,
} from "@theokit/sdk/server/auth";
import { defineAuth } from "@theokit/sdk/server/auth";

export type CreateSaasAuthOptions<TSession> = DefineAuthOptions<TSession> & {
  providers: ReadonlyArray<AuthProvider<unknown, string>>;
};

/**
 * Thin wrapper around `defineAuth`. Used by the `create-theokit --template saas`
 * boilerplate. Consumers wanting full control SHOULD call `defineAuth` directly
 * from `@theokit/sdk/server/auth`.
 */
export function createSaasAuth<TSession>(
  opts: CreateSaasAuthOptions<TSession>,
): AuthOrchestrator<TSession> {
  return defineAuth(opts);
}
