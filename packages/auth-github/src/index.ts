/**
 * @theokit/auth-github v0.1.0 — GitHub OAuth 2.0 provider for defineAuth.
 *
 * Per plan g11-auth-architecture-implementation T3.1 + Wasp blueprint Q1:
 *   - NO OIDC discovery — GitHub does not expose `.well-known/openid-configuration`.
 *     Endpoints are hardcoded (override via opts.* for GitHub Enterprise).
 *   - NO PKCE — GitHub OAuth 2.0 ignores PKCE params (RFC 7636 not implemented).
 *     CSRF defense via `state` only per RFC 6749 §10.12.
 *   - Conditional second fetch to /user/emails when scope includes `user:email`
 *     because GitHub's /user response returns `email: null` for users without a
 *     public email address (Wasp blueprint Q1 finding).
 *   - GitHubProfile.id is preserved as `number` (ADR D9 — Wasp incident lesson
 *     also applies: do not coerce types).
 *   - Userinfo `Authorization: token X` header (NOT `Bearer X`) per GitHub REST
 *     API docs.
 */

// import type { AuthProvider, AuthResult, OAuthTransaction } from "@theokit/sdk/server/auth"; // restore in T5.2 (SDK 1.6.0 publish)
import type { IncomingMessage } from "node:http";
import type { AuthProvider, AuthResult, OAuthTransaction } from "./sdk-shim.js";
import type { GitHubProfile, GitHubProviderOptions } from "./types.js";

export type { GitHubProfile, GitHubProviderOptions } from "./types.js";

const DEFAULT_AUTHORIZE = "https://github.com/login/oauth/authorize";
const DEFAULT_TOKEN = "https://github.com/login/oauth/access_token";
const DEFAULT_USERINFO = "https://api.github.com/user";
const DEFAULT_EMAILS = "https://api.github.com/user/emails";
const DEFAULT_SCOPES: readonly string[] = ["read:user", "user:email"];

export class GitHubAuthError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "GitHubAuthError";
    this.code = code;
  }
}

interface TokenResponse {
  access_token?: string;
  token_type?: string;
  scope?: string;
}

interface EmailEntry {
  email: string;
  primary: boolean;
  verified: boolean;
}

function parseCallbackUrl(req: IncomingMessage): URL {
  return new URL(`http://${req.headers.host ?? "localhost"}${req.url ?? "/"}`);
}

function resolveScopes(opts: GitHubProviderOptions): readonly string[] {
  return opts.scopes ?? DEFAULT_SCOPES;
}

export function github(opts: GitHubProviderOptions): AuthProvider<GitHubProfile, "github"> {
  const scopes = resolveScopes(opts);
  const wantsEmail = scopes.includes("user:email");
  const authorizeEndpoint = opts.authorizationEndpoint ?? DEFAULT_AUTHORIZE;
  const tokenEndpoint = opts.tokenEndpoint ?? DEFAULT_TOKEN;
  const userinfoEndpoint = opts.userinfoEndpoint ?? DEFAULT_USERINFO;
  const emailsEndpoint = opts.userEmailsEndpoint ?? DEFAULT_EMAILS;

  return {
    name: "github",

    async createAuthorizationURL(tx: OAuthTransaction): Promise<URL> {
      const url = new URL(authorizeEndpoint);
      url.searchParams.set("client_id", opts.clientId);
      url.searchParams.set("redirect_uri", opts.redirectUri);
      url.searchParams.set("scope", scopes.join(" "));
      url.searchParams.set("state", tx.state);
      // GitHub allows response_type omission; include for RFC 6749 compliance
      url.searchParams.set("response_type", "code");
      return url;
    },

    async handleCallback(
      req: IncomingMessage,
      tx: OAuthTransaction,
    ): Promise<AuthResult<GitHubProfile, "github">> {
      const url = parseCallbackUrl(req);
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");

      if (!code) {
        throw new GitHubAuthError("missing_code", "OAuth callback missing code query param");
      }
      if (state !== tx.state) {
        throw new GitHubAuthError(
          "state_mismatch",
          "OAuth state query param does not match transaction state (CSRF guard)",
        );
      }

      // Token exchange — GitHub accepts form-encoded body; request JSON response
      const tokenBody = new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: opts.redirectUri,
        client_id: opts.clientId,
        client_secret: opts.clientSecret,
      });
      const tokenRes = await fetch(tokenEndpoint, {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/x-www-form-urlencoded",
        },
        body: tokenBody.toString(),
      });
      if (!tokenRes.ok) {
        throw new GitHubAuthError(
          "token_exchange_failed",
          `GitHub token exchange failed: HTTP ${tokenRes.status}`,
        );
      }
      const tokens = (await tokenRes.json()) as TokenResponse;
      if (!tokens.access_token) {
        throw new GitHubAuthError(
          "missing_access_token",
          "GitHub token response did not include access_token",
        );
      }

      // Userinfo fetch — note `Authorization: token X` (NOT Bearer) per GitHub REST API
      const userRes = await fetch(userinfoEndpoint, {
        headers: {
          authorization: `token ${tokens.access_token}`,
          accept: "application/vnd.github+json",
        },
      });
      if (!userRes.ok) {
        throw new GitHubAuthError(
          "userinfo_fetch_failed",
          `GitHub userinfo fetch failed: HTTP ${userRes.status}`,
        );
      }
      const raw = (await userRes.json()) as Partial<GitHubProfile>;
      if (typeof raw.id !== "number") {
        throw new GitHubAuthError(
          "missing_id",
          "GitHub userinfo response missing numeric id field",
        );
      }
      if (!raw.login) {
        throw new GitHubAuthError(
          "missing_login",
          "GitHub userinfo response missing login field",
        );
      }

      // Conditional email fetch when scope grants user:email AND /user.email is null
      let email = raw.email ?? null;
      if (wantsEmail && !email) {
        const emailsRes = await fetch(emailsEndpoint, {
          headers: {
            authorization: `token ${tokens.access_token}`,
            accept: "application/vnd.github+json",
          },
        });
        if (emailsRes.ok) {
          const entries = (await emailsRes.json()) as EmailEntry[];
          const primary = entries.find((e) => e.primary && e.verified);
          email = primary?.email ?? entries.find((e) => e.verified)?.email ?? null;
        }
        // If emails endpoint fails we leave email null — non-fatal per Wasp pattern
      }

      const profile: GitHubProfile = {
        id: raw.id,
        login: raw.login,
        name: raw.name ?? null,
        email,
        avatar_url: raw.avatar_url,
      };

      return {
        profile,
        providerName: "github",
        rawTokens: {
          accessToken: tokens.access_token,
        },
      };
    },
  };
}
