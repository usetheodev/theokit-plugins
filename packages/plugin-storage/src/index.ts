/**
 * @theokit/plugin-storage — S3-compatible storage plugin for TheoKit.
 *
 * Per plan p8-plugin-storage v1.0 + blueprint v1.0 (SHIPPABLE 99.7/100).
 * Form 4 Hybrid: StorageProvider interface + S3Provider config-driven via
 * endpoint URL + defineStorageProvider consumer extension.
 *
 * Server-side only v0.1 — React `<Uploader>` component deferred to v0.x.
 *
 * @public
 */

// Types + canonical contract
export type {
  SignedUrlOptions,
  SignedUrlResult,
  StorageProvider,
} from "./types.js";
export { StorageError } from "./types.js";

// Provider extension helper (consumer-custom implementations)
export { defineStorageProvider } from "./provider.js";

// S3 default provider
export { S3Provider, type S3ProviderOptions } from "./s3-provider.js";
