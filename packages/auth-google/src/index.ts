/**
 * @theokit/auth-google v0.1.0 — Google OAuth (OIDC) provider for defineAuth.
 *
 * Scaffold per plan g11-auth-architecture-implementation T2.1 (v1.4).
 * Concrete implementation lands in T2.2.
 */

// import type { AuthProvider } from "@theokit/sdk/server/auth"; // restore in T5.2 (SDK 1.6.0 publish)
import type { AuthProvider } from "./sdk-shim.js";
import type { GoogleProfile, GoogleProviderOptions } from "./types.js";

export type { GoogleProfile, GoogleProviderOptions } from "./types.js";

export function google(
  _opts: GoogleProviderOptions,
): AuthProvider<GoogleProfile, "google"> {
  throw new Error(
    "TODO T2.2: google() provider implementation pending (OIDC discovery + PKCE + token exchange + userinfo fetch).",
  );
}
