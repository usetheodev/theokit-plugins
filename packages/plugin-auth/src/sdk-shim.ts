/**
 * Type-only shim mirroring `@theokit/sdk/server/auth` AuthProvider contract.
 *
 * Why a shim: SDK 1.6.0 (which ships the /server/auth sub-path) is unpublished
 * during the G11 implementation cycle — see plan
 * `g11-auth-architecture-implementation` T1.3 (SDK 1.6.0 workspace) vs T5.1
 * (SDK 1.6.0 npm publish). Workspace pnpm.overrides pins @theokit/sdk to the
 * published 1.5.0 to keep plugin-forms / plugin-canvas peerDep chains
 * resolvable; that version does NOT export /server/auth yet.
 *
 * Once T5.1 publishes @theokit/sdk@1.6.0:
 *   1. Drop this file.
 *   2. Replace `from './sdk-shim.js'` with `from '@theokit/sdk/server/auth'`.
 *   3. Bump peerDep `@theokit/sdk` to `>=1.6.0`.
 *
 * Shape MUST stay byte-identical to
 * `theokit-sdk/packages/sdk/src/server/auth/types.ts` AuthProvider so the
 * swap is a clean find-and-replace.
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
