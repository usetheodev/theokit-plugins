# Secrets — GitHub Actions

## NPM_TOKEN

Required for `pnpm release` to publish to npm via `.github/workflows/release.yml`.

### Setup

1. Visit https://www.npmjs.com/ — log in as a maintainer of the `@theokit` scope.
2. Navigate to **Profile → Access Tokens** → **Generate New Token** → **Granular Access Token** (preferred) or **Automation Token** (legacy).
3. Configure:
   - **Token name:** `theokit-plugins-ci-{YYYY-MM}` (rotation-friendly)
   - **Expiration:** 6 months (or shorter)
   - **Scope:** packages `@theokit/*` → "Read and write"
   - **Bypass 2FA when publishing:** required for automation
4. Copy the token (shown ONCE).
5. In `usetheodev/theokit-plugins` GitHub repo: **Settings → Secrets and variables → Actions → New repository secret**:
   - **Name:** `NPM_TOKEN`
   - **Value:** the token from step 4
6. Verify by triggering the release workflow on a test changeset.

### Rotation

Rotate every 6 months OR immediately if compromised:

1. Generate new token (steps 1-4 above)
2. Update the `NPM_TOKEN` secret value (step 5)
3. Revoke the old token at npm

### Local development

For local `pnpm release` (escape hatch — usually CI handles):

```bash
# Use npm CLI to set the token in your local .npmrc (NEVER commit)
npm login --scope=@theokit
# OR set NPM_TOKEN env directly
export NPM_TOKEN="..."
```

The repo's `.npmrc` (if any) MUST NOT contain the token literally; it should use env var substitution: `//registry.npmjs.org/:_authToken=${NPM_TOKEN}`.

### Audit trail

Every successful release run logs the token's identity (`npm whoami`) in the GH Actions output. Failed publishes (wrong token, expired, revoked) fail loudly with HTTP 401/403 — do NOT retry blindly; check the token first.
