/**
 * @theokit/plugin-storage — S3-compatible default provider.
 *
 * Per plan p8-plugin-storage v1.0 § Phase 1 / T1.3.
 * Blueprint ADR D2 (AWS SDK v3 modular REQUIRED peers) + D3 (PUT+GET only)
 * + D4 (single S3Provider + endpoint URL config) + D5 (15 min default TTL).
 *
 * Supports AWS S3 + Cloudflare R2 + MinIO + Backblaze B2 + LocalStack via a
 * single endpoint URL config. `forcePathStyle` auto-toggles based on endpoint
 * presence (remix file-storage-s3 pattern at lib/s3.ts:62-63).
 */

import type {
  S3Client,
  S3ClientConfig,
} from "@aws-sdk/client-s3";

import { StorageError } from "./types.js";
import type {
  SignedUrlOptions,
  SignedUrlResult,
  StorageProvider,
} from "./types.js";

/** Default presigned URL TTL — 15 minutes (rails activestorage convention). */
const DEFAULT_EXPIRES_IN_SECONDS = 900;

/**
 * Configuration for the canonical S3Provider.
 *
 * Two construction modes (discriminated union):
 * 1. **Credentials mode** — pass `accessKeyId` + `secretAccessKey` + `region`
 *    (+ optional `endpoint` / `forcePathStyle` / `sessionToken`). Plugin
 *    constructs a fresh `S3Client` lazily on first use.
 * 2. **Pre-built client mode** — pass `client` directly (for tests OR shared
 *    multi-bucket setups). Plugin uses the provided client as-is.
 *
 * Both modes require `bucket`.
 */
export type S3ProviderOptions =
  | (S3CommonOptions & S3CredentialsMode)
  | (S3CommonOptions & S3ClientMode);

interface S3CommonOptions {
  /** Bucket name. Required in both modes. */
  readonly bucket: string;
}

interface S3CredentialsMode {
  /** AWS access key ID. */
  readonly accessKeyId: string;
  /** AWS secret access key. */
  readonly secretAccessKey: string;
  /** AWS region (used by SigV4 + default endpoint). */
  readonly region: string;
  /**
   * Custom S3-compatible endpoint URL. Defaults to AWS S3 for the region.
   * Set this for Cloudflare R2 (`https://<account>.r2.cloudflarestorage.com`),
   * MinIO, LocalStack, Backblaze B2, etc.
   */
  readonly endpoint?: string;
  /**
   * Whether to use path-style bucket URLs (`/bucket/key`). Defaults to `true`
   * when `endpoint` is provided and `false` otherwise (matches remix
   * file-storage-s3 pattern).
   */
  readonly forcePathStyle?: boolean;
  /** Optional STS session token for temporary credentials. */
  readonly sessionToken?: string;
  readonly client?: undefined;
}

interface S3ClientMode {
  /**
   * Pre-built S3 client (for tests OR shared multi-bucket setups). When
   * provided, the credentials fields are NOT used — only `bucket` is read
   * at call time.
   */
  readonly client: S3Client;
  readonly accessKeyId?: undefined;
  readonly secretAccessKey?: undefined;
  readonly region?: undefined;
  readonly endpoint?: undefined;
  readonly forcePathStyle?: undefined;
  readonly sessionToken?: undefined;
}

/**
 * Create a canonical S3-backed StorageProvider.
 *
 * Required: `bucket` AND (`client` OR all of `accessKeyId`/`secretAccessKey`/`region`).
 */
export function S3Provider(opts: S3ProviderOptions): StorageProvider {
  if (!opts.bucket) {
    throw new StorageError("S3Provider requires { bucket }.", {
      provider: "s3",
      operation: "construct",
    });
  }
  if (!opts.client) {
    if (!opts.accessKeyId || !opts.secretAccessKey || !opts.region) {
      throw new StorageError(
        "S3Provider requires either { client } or { accessKeyId, secretAccessKey, region }.",
        { provider: "s3", operation: "construct" },
      );
    }
  }

  const lazyClient = createLazyClient(opts);

  return {
    name: "s3",

    async signedUploadUrl(args: SignedUrlOptions): Promise<SignedUrlResult> {
      const expiresIn = args.expiresInSeconds ?? DEFAULT_EXPIRES_IN_SECONDS;
      const { PutObjectCommand } = await loadS3Sdk();
      const { getSignedUrl } = await loadPresigner();
      const client = await lazyClient.get();
      const command = new PutObjectCommand({
        Bucket: opts.bucket,
        Key: args.key,
        ContentType: args.contentType,
        ContentLength: args.contentLength,
      });
      try {
        const url = await getSignedUrl(client, command, { expiresIn });
        return {
          url,
          key: args.key,
          expiresAt: new Date(Date.now() + expiresIn * 1000),
        };
      } catch (cause) {
        throw new StorageError("S3 signedUploadUrl failed", {
          provider: "s3",
          operation: "signedUploadUrl",
          raw: cause,
          cause,
        });
      }
    },

    async signedDownloadUrl(args: SignedUrlOptions): Promise<SignedUrlResult> {
      const expiresIn = args.expiresInSeconds ?? DEFAULT_EXPIRES_IN_SECONDS;
      const { GetObjectCommand } = await loadS3Sdk();
      const { getSignedUrl } = await loadPresigner();
      const client = await lazyClient.get();
      const command = new GetObjectCommand({
        Bucket: opts.bucket,
        Key: args.key,
      });
      try {
        const url = await getSignedUrl(client, command, { expiresIn });
        return {
          url,
          key: args.key,
          expiresAt: new Date(Date.now() + expiresIn * 1000),
        };
      } catch (cause) {
        throw new StorageError("S3 signedDownloadUrl failed", {
          provider: "s3",
          operation: "signedDownloadUrl",
          raw: cause,
          cause,
        });
      }
    },

    async deleteObject(key: string): Promise<void> {
      const { DeleteObjectCommand } = await loadS3Sdk();
      const client = await lazyClient.get();
      try {
        await client.send(new DeleteObjectCommand({ Bucket: opts.bucket, Key: key }));
      } catch (cause) {
        throw new StorageError(`S3 deleteObject failed for key=${key}`, {
          provider: "s3",
          operation: "deleteObject",
          raw: cause,
          cause,
        });
      }
    },

    async objectExists(key: string): Promise<boolean> {
      const { HeadObjectCommand } = await loadS3Sdk();
      const client = await lazyClient.get();
      try {
        await client.send(new HeadObjectCommand({ Bucket: opts.bucket, Key: key }));
        return true;
      } catch (cause) {
        if (isNotFound(cause)) return false;
        throw new StorageError(`S3 objectExists failed for key=${key}`, {
          provider: "s3",
          operation: "objectExists",
          raw: cause,
          cause,
        });
      }
    },
  };
}

/** Detect S3 `NotFound` / 404 errors (AWS SDK v3 returns `$metadata.httpStatusCode === 404`). */
function isNotFound(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
  return e.name === "NotFound" || e.$metadata?.httpStatusCode === 404;
}

/** Build a lazy client closure — instantiates S3Client on first use. */
function createLazyClient(opts: S3ProviderOptions): { get(): Promise<S3Client> } {
  if (opts.client) {
    const client = opts.client;
    return { async get() { return client; } };
  }
  let cached: S3Client | undefined;
  return {
    async get(): Promise<S3Client> {
      if (cached) return cached;
      const { S3Client } = await loadS3Sdk();
      const config: S3ClientConfig = {
        region: opts.region,
        credentials: {
          accessKeyId: opts.accessKeyId,
          secretAccessKey: opts.secretAccessKey,
          ...(opts.sessionToken !== undefined ? { sessionToken: opts.sessionToken } : {}),
        },
        // Remix file-storage-s3 pattern: forcePathStyle auto-true when endpoint provided.
        forcePathStyle: opts.forcePathStyle ?? opts.endpoint !== undefined,
        ...(opts.endpoint !== undefined ? { endpoint: opts.endpoint } : {}),
      };
      const { S3Client: S3ClientCtor } = await loadS3Sdk();
      cached = new S3ClientCtor(config);
      return cached;
    },
  };
}

/** Dynamic load helpers so consumers without AWS SDK installed fail with actionable error. */
async function loadS3Sdk(): Promise<typeof import("@aws-sdk/client-s3")> {
  try {
    return await import("@aws-sdk/client-s3");
  } catch (cause) {
    throw new StorageError(
      "@aws-sdk/client-s3 not installed. Run `pnpm add @aws-sdk/client-s3 @aws-sdk/s3-request-presigner` to use S3Provider.",
      { provider: "s3", operation: "loadSdk", cause },
    );
  }
}

async function loadPresigner(): Promise<typeof import("@aws-sdk/s3-request-presigner")> {
  try {
    return await import("@aws-sdk/s3-request-presigner");
  } catch (cause) {
    throw new StorageError(
      "@aws-sdk/s3-request-presigner not installed. Run `pnpm add @aws-sdk/s3-request-presigner` to use signed URL helpers.",
      { provider: "s3", operation: "loadPresigner", cause },
    );
  }
}
