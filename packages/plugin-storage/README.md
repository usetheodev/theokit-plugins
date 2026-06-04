# @theokit/plugin-storage

S3-compatible storage plugin for TheoKit — `StorageProvider` interface + `S3Provider` config-driven (AWS/R2/MinIO/B2 via endpoint URL) + signed URL helpers (PUT/GET). Server-side only v0.1.

> **Status:** v0.1.0 initial publish on the `@next` tag. Promote to `@latest` calendar-gated alongside the Onda 2 cohort.

## What you get

- `StorageProvider` interface — implement once, swap any S3-compatible backend.
- `S3Provider({...})` — canonical AWS SDK v3 wrapper (works with AWS S3 + Cloudflare R2 + MinIO + Backblaze B2 + LocalStack).
- `defineStorageProvider(impl)` — consumer extension (e.g., aws4fetch-based edge-runtime adapter).
- `signedUploadUrl(opts)` — presigned PUT URL for browser direct upload.
- `signedDownloadUrl(opts)` — presigned GET URL for private downloads.
- `deleteObject(key)` + `objectExists(key)` — server-side ops.
- Default TTL 15 min (rails activestorage convention); per-call override.
- `StorageError` typed errors with `{provider, operation, raw, cause}`.

**Out of scope v0.1** (deferred to v0.x): multipart upload (>5GB), POST policy (browser form), React `<Uploader>` component, edge-runtime support via `aws4fetch`.

## Install

```bash
pnpm add @theokit/plugin-storage@next @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
```

Node 22+ required (AWS SDK v3 is Node-only). For Cloudflare Workers / Vercel Edge: use `defineStorageProvider` with a custom `aws4fetch`-based implementation (v0.x will ship a canonical `S3ProviderEdge`).

## Wire it into your app

```ts
import { S3Provider } from "@theokit/plugin-storage";

const storage = S3Provider({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  bucket: "my-app-uploads",
  region: "us-east-1",
});

// In your server action / route handler:
const { url, expiresAt } = await storage.signedUploadUrl({
  key: `uploads/${user.id}/${Date.now()}.jpg`,
  contentType: "image/jpeg",
  expiresInSeconds: 600, // optional override; default 900
});

// Return URL to client; client PUTs the file directly:
//   fetch(url, { method: "PUT", body: file, headers: { "Content-Type": "image/jpeg" } });
```

## Multi-cloud config recipes

### AWS S3 (default)

```ts
S3Provider({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  bucket: "my-bucket",
  region: "us-east-1",
});
```

### Cloudflare R2

```ts
S3Provider({
  accessKeyId: process.env.R2_ACCESS_KEY_ID!,
  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  bucket: "my-r2-bucket",
  region: "auto", // R2 ignores region but SigV4 requires a value
  endpoint: "https://<account-id>.r2.cloudflarestorage.com",
  // forcePathStyle defaults true when endpoint is set
});
```

### MinIO (self-hosted)

```ts
S3Provider({
  accessKeyId: process.env.MINIO_ROOT_USER!,
  secretAccessKey: process.env.MINIO_ROOT_PASSWORD!,
  bucket: "my-bucket",
  region: "us-east-1",
  endpoint: "http://localhost:9000",
  // forcePathStyle: true (auto)
});
```

### Backblaze B2

```ts
S3Provider({
  accessKeyId: process.env.B2_KEY_ID!,
  secretAccessKey: process.env.B2_APPLICATION_KEY!,
  bucket: "my-b2-bucket",
  region: "us-east-005", // Use the region from your B2 endpoint URL
  endpoint: "https://s3.us-east-005.backblazeb2.com",
});
```

## Pre-built client mode

For tests or shared multi-bucket setups, pass a pre-built `S3Client` directly:

```ts
import { S3Client } from "@aws-sdk/client-s3";
import { S3Provider } from "@theokit/plugin-storage";

const sharedClient = new S3Client({
  region: "us-east-1",
  credentials: { accessKeyId: "...", secretAccessKey: "..." },
});

const uploads = S3Provider({ bucket: "uploads", client: sharedClient });
const avatars = S3Provider({ bucket: "avatars", client: sharedClient });
```

## Custom providers (edge runtime)

```ts
import { defineStorageProvider, type SignedUrlOptions, type SignedUrlResult } from "@theokit/plugin-storage";

// Build an edge-friendly provider using aws4fetch (~3KB; works on Cloudflare Workers / Vercel Edge):
const edgeStorage = defineStorageProvider({
  name: "s3-edge",
  async signedUploadUrl({ key, expiresInSeconds = 900 }: SignedUrlOptions): Promise<SignedUrlResult> {
    // Implement using aws4fetch + manual SigV4 query-string presigning
    // ...
    return { url: "...", key, expiresAt: new Date(Date.now() + expiresInSeconds * 1000) };
  },
  // ... other methods
});
```

## Browser direct-upload flow

The presigned URL pattern bypasses your server's bandwidth — clients PUT files directly to S3/R2/MinIO:

```ts
// Server: POST /api/uploads/presign — returns { url, key, expiresAt }
export async function POST(req: Request) {
  const { filename, contentType } = await req.json();
  const key = `uploads/${session.userId}/${Date.now()}-${slug(filename)}`;
  const { url, expiresAt } = await storage.signedUploadUrl({ key, contentType });
  return Response.json({ url, key, expiresAt });
}

// Client: presign → PUT directly
const { url, key } = await fetch("/api/uploads/presign", {
  method: "POST",
  body: JSON.stringify({ filename: file.name, contentType: file.type }),
}).then(r => r.json());

await fetch(url, {
  method: "PUT",
  body: file,
  headers: { "Content-Type": file.type },
});

// Now persist `key` in your DB; download later via signedDownloadUrl
```

## Security threats addressed

| Threat | Mitigation |
|---|---|
| **Long TTL link sharing** | Default 15 min; consumer override per-call is explicit |
| **Credential leak** | Plugin reads from caller (no env auto-magic); never logs secrets |
| **CSRF on upload** | Presigned URLs are key-specific — can't replay for a different content path |
| **Public bucket exposure** | Consumer responsibility: bucket IAM policy + CORS config (see below) |
| **Path traversal in keys** | Plugin does NOT sanitize keys — validate at boundary (recommended: `{userId}/{timestamp}-{slugged-filename}`) |

### Recommended bucket CORS for browser direct-upload

```json
{
  "CORSRules": [{
    "AllowedOrigins": ["https://app.test"],
    "AllowedMethods": ["PUT", "GET"],
    "AllowedHeaders": ["Content-Type", "Content-Length"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3000
  }]
}
```

### Recommended IAM policy for the plugin's IAM user

```json
{
  "Statement": [{
    "Effect": "Allow",
    "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject", "s3:HeadObject"],
    "Resource": "arn:aws:s3:::my-app-uploads/*"
  }]
}
```

## License

MIT
