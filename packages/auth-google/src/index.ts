/**
 * @theokit/auth-google v0.1.0 — Google OAuth (OIDC) provider for defineAuth.
 *
 * Implements OIDC discovery + PKCE + authorization-code flow + userinfo fetch
 * per RFC 6749 (OAuth 2.0), RFC 7636 (PKCE), and OpenID Connect Core 1.0.
 *
 * Composes theokit/server/auth primitives — does NOT reinvent crypto.
 *
 * Per plan g11-auth-architecture-implementation T2.2 + ADR D9:
 *   - GoogleProfile.sub is OIDC subject — case-sensitive, never lowercased.
 *   - Per v1.1 EC-3: opts.oidcBaseUrl overrides default; in NODE_ENV=test
 *     MOCK_GOOGLE_OIDC_BASE_URL env var takes precedence over opts (sidecar
 *     OIDC mock unblock for Playwright tests). Production builds ignore env.
 */

import type { IncomingMessage } from "node:http";
import type { AuthProvider, AuthResult, OAuthTransaction } from "@theokit/sdk/server/auth";
import { discoverOidcProvider, pkceChallengeFromVerifier } from "theokit/server/auth";
import type { GoogleProfile, GoogleProviderOptions } from "./types.js";

export type { GoogleProfile, GoogleProviderOptions } from "./types.js";

const DEFAULT_GOOGLE_OIDC_BASE = "https://accounts.google.com";
const GOOGLE_SCOPES = "openid profile email";

export class GoogleAuthError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "GoogleAuthError";
    this.code = code;
  }
}

interface TokenResponse {
  access_token?: string;
  id_token?: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
}

function resolveOidcBaseUrl(opts: GoogleProviderOptions): string {
  // EC-3: test-only env override (mirrors THEOKIT_TEST_RESPONSE_OVERRIDE gate)
  if (process.env.NODE_ENV === "test" && process.env.MOCK_GOOGLE_OIDC_BASE_URL) {
    return process.env.MOCK_GOOGLE_OIDC_BASE_URL;
  }
  return opts.oidcBaseUrl ?? DEFAULT_GOOGLE_OIDC_BASE;
}

function parseCallbackUrl(req: IncomingMessage): URL {
  const host = req.headers.host ?? "localhost";
  return new URL(`http://${host}${req.url ?? "/"}`);
}

export function google(opts: GoogleProviderOptions): AuthProvider<GoogleProfile, "google"> {
  return {
    name: "google",

    async createAuthorizationURL(tx: OAuthTransaction): Promise<URL> {
      if (!tx.pkceVerifier) {
        throw new GoogleAuthError(
          "missing_pkce_verifier",
          "OAuthTransaction must include pkceVerifier for Google (PKCE is mandatory per RFC 7636).",
        );
      }
      const baseUrl = resolveOidcBaseUrl(opts);
      const metadata = await discoverOidcProvider(baseUrl);
      const codeChallenge = await pkceChallengeFromVerifier(tx.pkceVerifier);

      const url = new URL(metadata.authorization_endpoint);
      url.searchParams.set("response_type", "code");
      url.searchParams.set("client_id", opts.clientId);
      url.searchParams.set("redirect_uri", opts.redirectUri);
      url.searchParams.set("scope", GOOGLE_SCOPES);
      url.searchParams.set("state", tx.state);
      url.searchParams.set("code_challenge", codeChallenge);
      url.searchParams.set("code_challenge_method", "S256");
      return url;
    },

    async handleCallback(
      req: IncomingMessage,
      tx: OAuthTransaction,
    ): Promise<AuthResult<GoogleProfile, "google">> {
      const url = parseCallbackUrl(req);
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");

      if (!code) {
        throw new GoogleAuthError("missing_code", "OAuth callback URL missing code query param");
      }
      if (state !== tx.state) {
        throw new GoogleAuthError(
          "state_mismatch",
          "OAuth state query param does not match transaction state (CSRF guard)",
        );
      }
      if (!tx.pkceVerifier) {
        throw new GoogleAuthError(
          "missing_pkce_verifier",
          "Transaction missing pkceVerifier — Google requires PKCE",
        );
      }

      const baseUrl = resolveOidcBaseUrl(opts);
      const metadata = await discoverOidcProvider(baseUrl);

      // Token exchange
      const tokenBody = new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: opts.redirectUri,
        client_id: opts.clientId,
        client_secret: opts.clientSecret,
        code_verifier: tx.pkceVerifier,
      });
      const tokenRes = await fetch(metadata.token_endpoint, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: tokenBody.toString(),
      });
      if (!tokenRes.ok) {
        throw new GoogleAuthError(
          "token_exchange_failed",
          `Google token exchange failed: HTTP ${tokenRes.status}`,
        );
      }
      const tokens = (await tokenRes.json()) as TokenResponse;
      if (!tokens.access_token) {
        throw new GoogleAuthError(
          "missing_access_token",
          "Google token response did not include access_token",
        );
      }

      // Userinfo fetch
      if (!metadata.userinfo_endpoint) {
        throw new GoogleAuthError(
          "no_userinfo_endpoint",
          "OIDC discovery metadata lacks userinfo_endpoint — cannot fetch profile",
        );
      }
      const userRes = await fetch(metadata.userinfo_endpoint, {
        headers: { authorization: `Bearer ${tokens.access_token}` },
      });
      if (!userRes.ok) {
        throw new GoogleAuthError(
          "userinfo_fetch_failed",
          `Google userinfo fetch failed: HTTP ${userRes.status}`,
        );
      }
      const raw = (await userRes.json()) as Partial<GoogleProfile>;
      if (!raw.sub) {
        throw new GoogleAuthError(
          "missing_sub",
          "Google userinfo response missing required sub field",
        );
      }
      if (!raw.email) {
        throw new GoogleAuthError(
          "missing_email",
          "Google userinfo response missing required email field",
        );
      }

      // Wasp incident lesson (ADR D9): preserve sub verbatim, no normalization
      const profile: GoogleProfile = {
        sub: raw.sub,
        email: raw.email,
        email_verified: raw.email_verified ?? false,
        name: raw.name,
        picture: raw.picture,
        locale: raw.locale,
      };

      return {
        profile,
        providerName: "google",
        rawTokens: {
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          idToken: tokens.id_token,
          expiresAt: tokens.expires_in ? Date.now() + tokens.expires_in * 1000 : undefined,
        },
      };
    },
  };
}
