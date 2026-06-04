# @theokit/plugin-storage

## [Unreleased]

## [0.1.0] - 2026-06-04 (initial publish on `@next`)

Per plan [`p8-plugin-storage-plan.md`](../../../.claude/knowledge-base/plans/p8-plugin-storage-plan.md) v1.0 and blueprint [`p8-plugin-storage-blueprint.md`](../../../.claude/knowledge-base/discoveries/blueprints/p8-plugin-storage-blueprint.md) v1.0 (SHIPPABLE 99.7/100). Form 4 Hybrid — `StorageProvider` interface + `S3Provider` config-driven (single adapter for AWS/R2/MinIO/B2 via endpoint URL) + `defineStorageProvider` consumer extension. Server-side only v0.1.

### Added

- **`StorageProvider`** interface — `{name, signedUploadUrl, signedDownloadUrl, deleteObject, objectExists}`.
- **`SignedUrlOptions`** + **`SignedUrlResult`** typed shapes. `expiresAt: Date` computed automatically.
- **`StorageError`** typed error carrying `{provider, operation, raw, cause}` for diagnostics.
- **`S3Provider(opts)`** factory — canonical AWS SDK v3 wrapper. Supports AWS S3 + Cloudflare R2 + MinIO + Backblaze B2 + LocalStack via single `endpoint` URL config. `forcePathStyle` auto-true when endpoint provided (remix file-storage-s3 pattern). Two construction modes via discriminated union: **credentials mode** (`accessKeyId` + `secretAccessKey` + `region`) OR **pre-built client mode** (`client: S3Client`).
- **`signedUploadUrl({key, expiresInSeconds?, contentType?, contentLength?})`** — wraps `PutObjectCommand` + `getSignedUrl`. Default TTL 900s (rails activestorage convention).
- **`signedDownloadUrl({key, expiresInSeconds?})`** — wraps `GetObjectCommand` + `getSignedUrl`.
- **`deleteObject(key)`** — wraps `DeleteObjectCommand`.
- **`objectExists(key)`** — wraps `HeadObjectCommand`; returns `false` on NotFound / 404, throws `StorageError` on other failures.
- **`defineStorageProvider(impl)`** — consumer extension helper for custom adapters (e.g., aws4fetch-based edge-runtime adapter).

### Notes

- **AWS SDK v3 is REQUIRED peer.** Consumer installs `@aws-sdk/client-s3@>=3.500.0` + `@aws-sdk/s3-request-presigner@>=3.500.0`. Plugin imports types statically + uses dynamic `import()` for runtime — so missing peers fail with actionable `StorageError` messages.
- **Node 22+ required.** AWS SDK v3 is Node-only. For edge runtimes (Cloudflare Workers / Vercel Edge), use `defineStorageProvider` with an `aws4fetch`-based custom adapter; canonical `S3ProviderEdge` deferred to v0.x.
- **Single adapter for all S3-compat providers.** `endpoint` URL drives R2/MinIO/B2/LocalStack. Separate `R2Provider`/`MinioProvider` factories explicitly rejected (ADR D4) — remix file-storage-s3 proves single adapter sufficient.
- **15 min default TTL.** Rails activestorage convention. Override per-call via `expiresInSeconds`.

### Out of scope v0.1 (deferred to v0.x)

- **Multipart upload** (>5GB files) — ADR D3 defers; 2/2 references (rails + encore) ship PUT+GET only in v0.1.
- **POST policy** (browser form upload via `<form>` enctype="multipart/form-data") — ADR D3 defers; browser-form-specific UX.
- **React `<Uploader>` component** — per user scope-lock sessão 10 (server-side only v0.1).
- **Edge runtime support** (Cloudflare Workers / Vercel Edge) — deferred v0.x; consumer can `defineStorageProvider` custom adapter in userland today.

### Security threats addressed

| Threat | Mitigation |
|---|---|
| Long TTL link sharing | Default 15 min; consumer override is explicit per-call |
| Credential leak | Plugin never logs; reads creds from caller (no env auto-magic) |
| CSRF on upload | Presigned URLs are key-specific — can't replay for different content path |
| Public bucket exposure | Consumer responsibility (bucket IAM policy + CORS); README ships canonical config snippets |
| Path traversal in keys | Plugin does NOT sanitize keys — consumer validates at boundary (README recommends `{userId}/{timestamp}-{slug}` pattern) |

### Quality gates

- 25 unit + integration tests GREEN (3 types/defineStorageProvider + 4 factory validation + 4 signedUploadUrl + 2 signedDownloadUrl + 2 deleteObject + 5 objectExists + 4 multi-cloud config / signed URL roundtrip).
- `npx tsc --noEmit`: exit 0 (discriminated union covers both construction modes cleanly).
- `npx tsup`: `dist/index.js` 5.39 KB + `dist/index.d.ts` 6.11 KB.
- Zero plugin-side runtime deps.

### Deferred (Onda 2 calendar window ~2026-07-15+)

- **dogfood-app smoke test** — wire `S3Provider({...})` + 1 demo route returning signed upload URL.
- **npm publish** via `pnpm publish --tag next --access public`.
- **Real R2/MinIO smoke** with test bucket (CI env-gated).
