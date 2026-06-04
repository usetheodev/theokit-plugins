/**
 * Type-only shim mirroring `@theokit/sdk/server/auth` AuthProvider contract.
 * See `@theokit/auth-google` src/sdk-shim.ts for the rationale and the T5.2
 * removal procedure (identical).
 */

import type { IncomingMessage } from "node:http";

export interface OAuthTransaction {
  state: string;
  pkceVerifier?: string;
  returnTo?: string;
  createdAt: number;
  expiresAt: number;
}

export interface AuthResult<TProfile, TName extends string = string> {
  profile: TProfile;
  providerName: TName;
  rawTokens?: {
    accessToken?: string;
    refreshToken?: string;
    idToken?: string;
    expiresAt?: number;
  };
}

export interface AuthProvider<TProfile, TName extends string = string> {
  readonly name: TName;
  createAuthorizationURL(tx: OAuthTransaction): Promise<URL>;
  handleCallback(
    req: IncomingMessage,
    tx: OAuthTransaction,
  ): Promise<AuthResult<TProfile, TName>>;
}
