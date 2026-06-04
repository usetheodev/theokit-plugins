/**
 * @theokit/plugin-storage — canonical types.
 *
 * Per plan p8-plugin-storage v1.0 + blueprint v1.0 (SHIPPABLE 99.7/100).
 * Form 4 Hybrid — StorageProvider interface + S3Provider config-driven via
 * endpoint URL.
 */

/** Options for signing a URL (upload OR download). */
export interface SignedUrlOptions {
  /** Object key within the bucket. */
  readonly key: string;
  /** Expiry seconds; default 900 (15 min, rails activestorage convention). */
  readonly expiresInSeconds?: number;
  /** Optional content-type constraint (presign PUT). */
  readonly contentType?: string;
  /** Optional content-length constraint (presign PUT). */
  readonly contentLength?: number;
}

/** Result returned by `signedUploadUrl` / `signedDownloadUrl`. */
export interface SignedUrlResult {
  /** The presigned URL the browser uses for PUT/GET directly. */
  readonly url: string;
  /** The object key (same as input — echoed for ergonomic chaining). */
  readonly key: string;
  /** When the URL expires. */
  readonly expiresAt: Date;
}

/**
 * Storage provider contract — implementations expose signed URL primitives
 * + minimal server-side ops (delete + exists). Multipart upload + POST policy
 * deferred to v0.x.
 */
export interface StorageProvider {
  /** Provider identifier (e.g., "s3"). */
  readonly name: string;
  /** Build a presigned URL the browser can PUT to (direct upload). */
  signedUploadUrl(opts: SignedUrlOptions): Promise<SignedUrlResult>;
  /** Build a presigned URL the browser can GET from (private download). */
  signedDownloadUrl(opts: SignedUrlOptions): Promise<SignedUrlResult>;
  /** Server-side delete an object by key. */
  deleteObject(key: string): Promise<void>;
  /** Server-side check whether an object exists (HEAD). */
  objectExists(key: string): Promise<boolean>;
}

/**
 * Typed error wrapping provider-side failures (signing OR server-side ops).
 */
export class StorageError extends Error {
  override readonly name = "StorageError";
  readonly provider: string;
  readonly operation: string;
  readonly raw: unknown;
  constructor(
    message: string,
    opts: { provider: string; operation: string; raw?: unknown; cause?: unknown },
  ) {
    super(message, opts.cause !== undefined ? { cause: opts.cause } : undefined);
    this.provider = opts.provider;
    this.operation = opts.operation;
    this.raw = opts.raw;
  }
}
