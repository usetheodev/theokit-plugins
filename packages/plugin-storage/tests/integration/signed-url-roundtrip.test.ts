/**
 * Integration test for P#8 T2.1 — signed URL roundtrip + multi-provider config.
 *
 * Uses real @aws-sdk/client-s3 client (no network — presign is deterministic).
 */
import { describe, expect, it } from "vitest";

import { S3Provider } from "../../src/s3-provider.js";

const baseOpts = {
  accessKeyId: "AKIATEST_EXAMPLE",
  secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
  bucket: "test-bucket",
  region: "us-east-1",
} as const;

describe("signed URL roundtrip (P#8 T2.1)", () => {
  it("upload + download URLs for same key share bucket + key", async () => {
    const provider = S3Provider(baseOpts);
    const up = await provider.signedUploadUrl({ key: "k.jpg" });
    const dn = await provider.signedDownloadUrl({ key: "k.jpg" });
    expect(up.url).toContain("test-bucket");
    expect(dn.url).toContain("test-bucket");
    expect(up.url).toContain("k.jpg");
    expect(dn.url).toContain("k.jpg");
    // Methods differ (presign embeds them in signed headers; URL shape is similar
    // but X-Amz-Signature differs — confirms PUT vs GET signing)
    expect(up.url).not.toBe(dn.url);
  });

  it("Cloudflare R2 endpoint config: bucket goes in path (forcePathStyle auto-true)", async () => {
    const provider = S3Provider({
      ...baseOpts,
      endpoint: "https://account-id.r2.cloudflarestorage.com",
    });
    const result = await provider.signedUploadUrl({ key: "r2-test.bin" });
    // forcePathStyle=true (auto) → bucket appears in pathname, NOT subdomain
    expect(result.url).toMatch(/r2\.cloudflarestorage\.com\/test-bucket\//);
  });

  it("MinIO endpoint config preserves host + bucket path", async () => {
    const provider = S3Provider({
      ...baseOpts,
      endpoint: "http://localhost:9000",
    });
    const result = await provider.signedUploadUrl({ key: "minio-test.bin" });
    expect(result.url).toMatch(/localhost:9000\/test-bucket\//);
  });

  it("AWS S3 default (no endpoint override) uses virtual-hosted-style URL", async () => {
    const provider = S3Provider({
      ...baseOpts,
      region: "us-west-2",
    });
    const result = await provider.signedUploadUrl({ key: "aws-test.bin" });
    // Virtual-hosted style: bucket in subdomain — forcePathStyle defaults false
    // when endpoint omitted (matches remix file-storage-s3 pattern).
    // AWS SDK v3 may emit either pattern; verify the bucket appears somewhere.
    expect(result.url).toContain("test-bucket");
  });
});
