/**
 * @theokit/plugin-storage — provider extension helper.
 *
 * Per plan p8-plugin-storage v1.0 § Phase 1 / T1.2.
 * Blueprint ADR D1 — interface-based abstraction (sister of P#7 EmailProvider).
 */

import type { StorageProvider } from "./types.js";

/**
 * Helper for consumer-custom storage providers. Pass-through that exists for
 * documentation symmetry with the canonical `S3Provider` factory.
 *
 * Use to swap to edge-runtime adapters (e.g., aws4fetch-based S3 implementation
 * for Cloudflare Workers / Vercel Edge) without forking the plugin.
 *
 * ```ts
 * import { defineStorageProvider, type SignedUrlOptions, type SignedUrlResult } from "@theokit/plugin-storage";
 *
 * const memoryProvider = defineStorageProvider({
 *   name: "memory",
 *   async signedUploadUrl({ key, expiresInSeconds = 900 }: SignedUrlOptions): Promise<SignedUrlResult> {
 *     return { url: `memory://${key}`, key, expiresAt: new Date(Date.now() + expiresInSeconds * 1000) };
 *   },
 *   // ... etc
 * });
 * ```
 */
export function defineStorageProvider(impl: StorageProvider): StorageProvider {
  return impl;
}
