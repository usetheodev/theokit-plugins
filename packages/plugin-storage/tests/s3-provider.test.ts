/**
 * RED tests for P#8 T1.3 — S3Provider factory + presign + delete + exists.
 *
 * Uses a real S3Client from @aws-sdk/client-s3 (devDep) — presign URLs are
 * deterministic given fixed credentials so we can assert query params.
 * For delete + exists ops, vi.mock the S3Client.send method at the client
 * level (no network calls).
 */
import { describe, expect, it, vi } from "vitest";
import { HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";

import { S3Provider } from "../src/s3-provider.js";
import { StorageError } from "../src/types.js";

const baseOpts = {
  accessKeyId: "AKIATEST_EXAMPLE",
  secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
  bucket: "test-bucket",
  region: "us-east-1",
} as const;

describe("S3Provider factory validation (P#8 T1.3)", () => {
  it("throws StorageError when bucket missing", () => {
    expect(() =>
      // @ts-expect-error — testing runtime validation
      S3Provider({ accessKeyId: "x", secretAccessKey: "y", region: "us-east-1" }),
    ).toThrow(StorageError);
  });

  it("throws StorageError when accessKeyId/secretAccessKey/region all missing AND no client", () => {
    expect(() =>
      // @ts-expect-error — testing runtime validation
      S3Provider({ bucket: "test-bucket" }),
    ).toThrow(StorageError);
  });

  it("accepts a pre-built client (no creds required at factory time)", () => {
    const client = new S3Client({ region: "us-east-1" });
    const provider = S3Provider({ bucket: "test-bucket", client });
    expect(provider.name).toBe("s3");
  });

  it("returns provider with name='s3'", () => {
    const provider = S3Provider(baseOpts);
    expect(provider.name).toBe("s3");
  });
});

describe("S3Provider signedUploadUrl (P#8 T1.3)", () => {
  it("returns URL containing X-Amz-Signature", async () => {
    const provider = S3Provider(baseOpts);
    const result = await provider.signedUploadUrl({ key: "uploads/test.jpg" });
    expect(result.url).toContain("X-Amz-Signature");
    expect(result.url).toContain("test-bucket");
    expect(result.url).toContain("uploads/test.jpg");
    expect(result.key).toBe("uploads/test.jpg");
    expect(result.expiresAt).toBeInstanceOf(Date);
  });

  it("applies default TTL 900s when expiresInSeconds omitted", async () => {
    const provider = S3Provider(baseOpts);
    const before = Date.now();
    const result = await provider.signedUploadUrl({ key: "k" });
    // URL should contain X-Amz-Expires=900
    expect(result.url).toMatch(/X-Amz-Expires=900/);
    // expiresAt should be ~900s in the future
    const deltaMs = result.expiresAt.getTime() - before;
    expect(deltaMs).toBeGreaterThanOrEqual(900_000 - 1000);
    expect(deltaMs).toBeLessThanOrEqual(900_000 + 1000);
  });

  it("applies custom TTL when expiresInSeconds provided", async () => {
    const provider = S3Provider(baseOpts);
    const result = await provider.signedUploadUrl({ key: "k", expiresInSeconds: 300 });
    expect(result.url).toMatch(/X-Amz-Expires=300/);
  });

  it("URL reflects endpoint override (R2/MinIO/B2 path)", async () => {
    const provider = S3Provider({
      ...baseOpts,
      endpoint: "https://account.r2.cloudflarestorage.com",
    });
    const result = await provider.signedUploadUrl({ key: "k" });
    // forcePathStyle defaults true with custom endpoint → bucket in path
    expect(result.url).toMatch(/r2\.cloudflarestorage\.com/);
    expect(result.url).toContain("test-bucket");
  });
});

describe("S3Provider signedDownloadUrl (P#8 T1.3)", () => {
  it("returns URL containing X-Amz-Signature for GET", async () => {
    const provider = S3Provider(baseOpts);
    const result = await provider.signedDownloadUrl({ key: "uploads/test.jpg" });
    expect(result.url).toContain("X-Amz-Signature");
    expect(result.url).toContain("test-bucket");
    expect(result.url).toContain("uploads/test.jpg");
  });

  it("URL TTL is independent from upload", async () => {
    const provider = S3Provider(baseOpts);
    const result = await provider.signedDownloadUrl({
      key: "k",
      expiresInSeconds: 60,
    });
    expect(result.url).toMatch(/X-Amz-Expires=60/);
  });
});

describe("S3Provider deleteObject (P#8 T1.3)", () => {
  it("invokes S3 DeleteObjectCommand via send", async () => {
    const client = new S3Client({ region: "us-east-1" });
    const sendSpy = vi.spyOn(client, "send").mockResolvedValue({} as never);
    const provider = S3Provider({ bucket: "test-bucket", client });

    await provider.deleteObject("uploads/del.jpg");

    expect(sendSpy).toHaveBeenCalledOnce();
    const command = sendSpy.mock.calls[0]?.[0] as {
      input?: { Bucket?: string; Key?: string };
    };
    expect(command?.input?.Bucket).toBe("test-bucket");
    expect(command?.input?.Key).toBe("uploads/del.jpg");
  });

  it("wraps S3 errors in StorageError", async () => {
    const client = new S3Client({ region: "us-east-1" });
    vi.spyOn(client, "send").mockRejectedValue(new Error("AccessDenied"));
    const provider = S3Provider({ bucket: "test-bucket", client });

    await expect(provider.deleteObject("k")).rejects.toThrow(StorageError);
  });
});

describe("S3Provider objectExists (P#8 T1.3)", () => {
  it("returns true when HEAD succeeds", async () => {
    const client = new S3Client({ region: "us-east-1" });
    vi.spyOn(client, "send").mockResolvedValue({} as never);
    const provider = S3Provider({ bucket: "test-bucket", client });

    const exists = await provider.objectExists("uploads/maybe.jpg");
    expect(exists).toBe(true);
  });

  it("returns false on NotFound error", async () => {
    const client = new S3Client({ region: "us-east-1" });
    const notFound = Object.assign(new Error("Not Found"), {
      name: "NotFound",
      $metadata: { httpStatusCode: 404 },
    });
    vi.spyOn(client, "send").mockRejectedValue(notFound);
    const provider = S3Provider({ bucket: "test-bucket", client });

    const exists = await provider.objectExists("missing.jpg");
    expect(exists).toBe(false);
  });

  it("returns false on $metadata.httpStatusCode === 404", async () => {
    const client = new S3Client({ region: "us-east-1" });
    const err = Object.assign(new Error("Not Found"), {
      $metadata: { httpStatusCode: 404 },
    });
    vi.spyOn(client, "send").mockRejectedValue(err);
    const provider = S3Provider({ bucket: "test-bucket", client });

    expect(await provider.objectExists("k")).toBe(false);
  });

  it("wraps non-404 errors in StorageError", async () => {
    const client = new S3Client({ region: "us-east-1" });
    vi.spyOn(client, "send").mockRejectedValue(new Error("S3 down"));
    const provider = S3Provider({ bucket: "test-bucket", client });

    await expect(provider.objectExists("k")).rejects.toThrow(StorageError);
  });

  it("uses HeadObjectCommand specifically", async () => {
    const client = new S3Client({ region: "us-east-1" });
    const sendSpy = vi.spyOn(client, "send").mockResolvedValue({} as never);
    const provider = S3Provider({ bucket: "test-bucket", client });

    await provider.objectExists("k");

    const command = sendSpy.mock.calls[0]?.[0];
    expect(command).toBeInstanceOf(HeadObjectCommand);
  });
});
