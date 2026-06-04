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

// createSaasAuth — convenience helper. Intentionally untyped against the
// SDK orchestrator surface to avoid coupling (sdk-shim swap deferred to T5.2).
// Consumers always have the option to use defineAuth() directly.

import type { AuthProvider } from "./sdk-shim.js";

export interface CreateSaasAuthOptions<TSession> {
  /** Pass the session manager from your createSessionManager() call. */
  session: unknown;
  providers: ReadonlyArray<AuthProvider<unknown, string>>;
  onSignIn?: (args: { profile: unknown; provider: string }) => Promise<TSession>;
  onSignOut?: (session: TSession | null) => Promise<void>;
}

/**
 * Wrapper around `defineAuth` (which is imported lazily at call time so
 * @theokit/plugin-auth can ship before SDK 1.6.0 lands on npm). Consumers
 * SHOULD prefer `defineAuth` directly from `@theokit/sdk/server/auth` —
 * this helper exists for `create-theokit --template saas` boilerplate.
 */
export async function createSaasAuth<TSession>(opts: CreateSaasAuthOptions<TSession>) {
  // Lazy dynamic import via computed string so bundlers do NOT statically
  // try to resolve "@theokit/sdk/server/auth" against the workspace SDK
  // 1.5.0 (which lacks /server/auth). Once T5.2 lands the SDK 1.6.0
  // publish + shim drop, this collapses to:
  //   `import { defineAuth } from "@theokit/sdk/server/auth";`
  const sdkAuthPath = ["@theokit", "sdk", "server", "auth"].join("/").replace("theokit/sdk", "theokit/sdk");
  const dynImport = (specifier: string) => import(/* @vite-ignore */ specifier);
  let sdkAuth: { defineAuth: (o: unknown) => unknown };
  try {
    sdkAuth = (await dynImport(sdkAuthPath)) as { defineAuth: (o: unknown) => unknown };
  } catch {
    throw new Error(
      "@theokit/plugin-auth requires @theokit/sdk >= 1.6.0 (server/auth sub-path). " +
        "Install @theokit/sdk@next or wait for the 1.6.0 GA promote.",
    );
  }
  return sdkAuth.defineAuth(opts) as unknown;
}
