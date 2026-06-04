/**
 * RED tests for P#8 T1.2 — StorageProvider interface + defineStorageProvider.
 */
import { describe, expect, it } from "vitest";

import { defineStorageProvider } from "../src/provider.js";
import {
  StorageError,
  type SignedUrlOptions,
  type SignedUrlResult,
  type StorageProvider,
} from "../src/types.js";

describe("StorageProvider types (P#8 T1.2)", () => {
  it("interface compiles with all 4 canonical methods", () => {
    const stub: StorageProvider = {
      name: "stub",
      async signedUploadUrl(_opts: SignedUrlOptions): Promise<SignedUrlResult> {
        return { url: "stub://up", key: _opts.key, expiresAt: new Date() };
      },
      async signedDownloadUrl(_opts: SignedUrlOptions): Promise<SignedUrlResult> {
        return { url: "stub://dl", key: _opts.key, expiresAt: new Date() };
      },
      async deleteObject(_key: string): Promise<void> {},
      async objectExists(_key: string): Promise<boolean> { return false; },
    };
    expect(stub.name).toBe("stub");
  });

  it("SignedUrlOptions accepts all documented fields", () => {
    const full: SignedUrlOptions = {
      key: "uploads/test.jpg",
      expiresInSeconds: 600,
      contentType: "image/jpeg",
      contentLength: 1024,
    };
    expect(full.key).toBe("uploads/test.jpg");
  });

  it("StorageError carries provider + operation + raw + cause", () => {
    const root = new Error("S3 root cause");
    const err = new StorageError("op failed", {
      provider: "s3",
      operation: "signedUploadUrl",
      raw: { code: "AccessDenied" },
      cause: root,
    });
    expect(err.name).toBe("StorageError");
    expect(err.provider).toBe("s3");
    expect(err.operation).toBe("signedUploadUrl");
    expect((err as Error & { cause?: unknown }).cause).toBe(root);
  });
});

describe("defineStorageProvider (P#8 T1.2)", () => {
  it("passes through the implementation unchanged", async () => {
    const impl: StorageProvider = {
      name: "memory",
      async signedUploadUrl({ key }) {
        return { url: `memory://up/${key}`, key, expiresAt: new Date() };
      },
      async signedDownloadUrl({ key }) {
        return { url: `memory://dl/${key}`, key, expiresAt: new Date() };
      },
      async deleteObject() {},
      async objectExists() { return false; },
    };
    const provider = defineStorageProvider(impl);
    expect(provider).toBe(impl);
    expect(provider.name).toBe("memory");
    const result = await provider.signedUploadUrl({ key: "x" });
    expect(result.url).toBe("memory://up/x");
  });
});
