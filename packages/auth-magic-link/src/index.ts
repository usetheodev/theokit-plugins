/**
 * @theokit/auth-magic-link v0.1.0 — email magic-link provider.
 *
 * Per plan g11-auth-architecture-implementation T4.1:
 *   - 32-byte URL-safe random tokens (crypto.randomBytes).
 *   - Pluggable MagicLinkStore (ADR D7) — createMemoryStore / createOrmStore.
 *   - Consumer-supplied sendEmail callback (ADR D8) — apps wire any transport;
 *     errors propagate (not swallowed).
 *   - Token lifetime default 15 min (configurable via opts.tokenLifetimeMs).
 *   - Single-use atomic consumption (EC-11 SHOULD TEST).
 *   - Email validation at input boundary (EC-12 SHOULD TEST): missing /
 *     malformed email throws BEFORE token creation.
 */

import { randomBytes } from "node:crypto";
import type { IncomingMessage } from "node:http";
import type { AuthProvider, AuthResult, OAuthTransaction } from "@theokit/sdk/server/auth";
import type { MagicLinkProfile, MagicLinkProviderOptions } from "./types.js";

export type {
  MagicLinkProfile,
  MagicLinkProviderOptions,
  MagicLinkStore,
  MagicLinkTokenRecord,
  SendMagicLinkFn,
} from "./types.js";
export { createMemoryStore, createOrmStore } from "./store.js";
export type { MagicLinkRepository } from "./store.js";

const DEFAULT_LIFETIME_MS = 15 * 60 * 1000;
const DEFAULT_CALLBACK_PATH = "/api/auth/magic-link/callback";
const DEFAULT_CHECK_EMAIL_PAGE = "/auth/check-email";
const TOKEN_BYTES = 32;
// Minimal email guard — full RFC 5322 is overkill. Catches obvious invalids;
// real validation happens at the auth provider (SMTP / IdP) layer.
const EMAIL_GUARD = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class MagicLinkAuthError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "MagicLinkAuthError";
    this.code = code;
  }
}

export class MagicLinkConfigError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "MagicLinkConfigError";
    this.code = code;
  }
}

function generateToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

async function defaultResolveEmail(req: IncomingMessage): Promise<string | null> {
  // Try query string first
  const url = new URL(`http://${req.headers.host ?? "localhost"}${req.url ?? "/"}`);
  const qs = url.searchParams.get("email");
  if (qs) return qs.toLowerCase().trim();
  // Fall back to form-data body. Buffer raw bytes (consumer may use middleware
  // that already parsed; that's the consumer's job — we only handle the bare case).
  if (req.method === "POST" || req.method === "PUT") {
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of req as unknown as AsyncIterable<Buffer>) {
        chunks.push(chunk);
      }
      const body = Buffer.concat(chunks).toString("utf8");
      const ct = (req.headers["content-type"] ?? "").toLowerCase();
      if (ct.includes("application/json")) {
        const json = JSON.parse(body) as { email?: unknown };
        return typeof json.email === "string" ? json.email.toLowerCase().trim() : null;
      }
      if (ct.includes("application/x-www-form-urlencoded")) {
        const params = new URLSearchParams(body);
        const email = params.get("email");
        return email ? email.toLowerCase().trim() : null;
      }
    } catch {
      return null;
    }
  }
  return null;
}

function validateEmail(email: string | null): string {
  if (!email || !email.trim()) {
    throw new MagicLinkConfigError(
      "invalid_email",
      "Magic-link sign-in requires an email field in the request",
    );
  }
  const normalized = email.toLowerCase().trim();
  if (!EMAIL_GUARD.test(normalized)) {
    throw new MagicLinkConfigError(
      "invalid_email",
      `Email "${normalized}" failed basic shape validation`,
    );
  }
  return normalized;
}

export function magicLink(
  opts: MagicLinkProviderOptions,
): AuthProvider<MagicLinkProfile, "magic-link"> & {
  /** Begin sign-in: validate email, persist token, send email. Returns the redirect URL. */
  startSignIn(req: IncomingMessage): Promise<URL>;
} {
  const lifetimeMs = opts.tokenLifetimeMs ?? DEFAULT_LIFETIME_MS;
  const callbackPath = opts.callbackPath ?? DEFAULT_CALLBACK_PATH;
  const checkPage = opts.checkEmailPage ?? DEFAULT_CHECK_EMAIL_PAGE;
  const resolveEmail = opts.resolveEmail ?? defaultResolveEmail;

  return {
    name: "magic-link",

    async startSignIn(req: IncomingMessage): Promise<URL> {
      const rawEmail = await resolveEmail(req);
      const email = validateEmail(rawEmail);
      const token = generateToken();
      const expiresAt = new Date(Date.now() + lifetimeMs);

      await opts.store.createToken({ email, token, expiresAt });

      const magicLinkUrl = `${opts.callbackBaseUrl}${callbackPath}?token=${encodeURIComponent(token)}`;
      // EC: emit email; errors propagate (D8 invariant — never swallowed)
      await opts.sendEmail({ to: email, magicLinkUrl, expiresAt, token });

      return new URL(checkPage, opts.callbackBaseUrl);
    },

    async createAuthorizationURL(_tx: OAuthTransaction): Promise<URL> {
      throw new MagicLinkConfigError(
        "use_start_sign_in",
        "magic-link does not use OAuth authorization flow — call provider.startSignIn(req) directly",
      );
    },

    async handleCallback(
      req: IncomingMessage,
      _tx: OAuthTransaction,
    ): Promise<AuthResult<MagicLinkProfile, "magic-link">> {
      const url = new URL(`http://${req.headers.host ?? "localhost"}${req.url ?? "/"}`);
      const token = url.searchParams.get("token");
      if (!token) {
        throw new MagicLinkAuthError(
          "missing_token",
          "Magic-link callback URL missing token query param",
        );
      }
      const record = await opts.store.consumeToken({ token });
      if (!record) {
        throw new MagicLinkAuthError(
          "invalid_or_expired_token",
          "Magic-link token is missing, expired, or already used",
        );
      }
      return {
        profile: { email: record.email, verifiedAt: new Date() },
        providerName: "magic-link",
      };
    },
  };
}
