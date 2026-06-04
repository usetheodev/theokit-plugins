# @theokit/auth-google

Google OAuth (OIDC) provider for [`@theokit/sdk`](https://www.npmjs.com/package/@theokit/sdk) auth orchestrator (`defineAuth`).

> Status: **0.1.0 scaffold** (T2.1 of plan `g11-auth-architecture-implementation`). The factory throws `TODO T2.2` until the implementation phase lands.

## Install

```bash
pnpm add @theokit/auth-google @theokit/sdk
```

Peer dependencies (you must install): `@theokit/sdk >= 1.5.0`, `theokit >= 0.2.4`.

## Usage (intended T2.2+ surface)

```ts
import { defineAuth } from "@theokit/sdk/server/auth";
import { google } from "@theokit/auth-google";

export const auth = defineAuth({
  session: mySessionManager,
  providers: [
    google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      redirectUri: "https://myapp.com/api/auth/google/callback",
    }),
  ],
  onSignIn: async ({ profile }) => ({ userId: profile.sub }),
});
```

## Google Cloud Console setup (planned for T2.3)

1. Create OAuth 2.0 Client ID in Google Cloud Console.
2. Authorized redirect URI: `https://<your-domain>/api/auth/google/callback`.
3. Required scopes: `openid`, `profile`, `email` (added automatically by the provider).
4. Copy the Client ID + Client Secret into `.env`:
   ```
   GOOGLE_CLIENT_ID=...
   GOOGLE_CLIENT_SECRET=...
   ```

## Profile shape

```ts
interface GoogleProfile {
  sub: string;          // OIDC subject — case-sensitive, never lowercased
  email: string;
  email_verified: boolean;
  name?: string;
  picture?: string;
  locale?: string;
}
```

> Per plan ADR D9 — Wasp incident lesson: `sub` is preserved verbatim (no normalization, no lowercasing). Consumers MUST treat it as the canonical user identifier from Google.

## License

MIT — see [LICENSE](./LICENSE).
