# @theokit/plugin-auth

Convenience meta-package bundling the three Tier-1 auth providers for [`@theokit/sdk`](https://www.npmjs.com/package/@theokit/sdk):

- [`@theokit/auth-google`](../auth-google) — Google OAuth (OIDC)
- [`@theokit/auth-github`](../auth-github) — GitHub OAuth 2.0
- [`@theokit/auth-magic-link`](../auth-magic-link) — email magic link

Install one, get all three. Apps wanting a smaller surface should install the specific `@theokit/auth-*` package directly.

## Install

```bash
pnpm add @theokit/plugin-auth @theokit/sdk theokit
```

## Quick start

```ts
// server/auth/index.ts
import { defineAuth } from "@theokit/sdk/server/auth";
import {
  google,
  github,
  magicLink,
  createMemoryStore,
} from "@theokit/plugin-auth";
import { sessionManager } from "./session.js";

export const auth = defineAuth({
  session: sessionManager,
  providers: [
    google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      redirectUri: "https://myapp.com/api/auth/google/callback",
    }),
    github({
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
      redirectUri: "https://myapp.com/api/auth/github/callback",
    }),
    magicLink({
      store: createMemoryStore(), // dev only — use createOrmStore for prod
      callbackBaseUrl: "https://myapp.com",
      sendEmail: async ({ to, magicLinkUrl }) => {
        // wire Resend / SendGrid / Nodemailer here
      },
    }),
  ],
  onSignIn: async ({ profile, provider }) => {
    // provider-specific upsert (see ADR D9 for case-sensitive sub / numeric id)
    return { userId: "..." };
  },
});
```

## `createSaasAuth` helper

`create-theokit --template saas` boilerplate uses this helper:

```ts
import { createSaasAuth, google, github } from "@theokit/plugin-auth";
import { sessionManager } from "./session.js";

export const auth = await createSaasAuth({
  session: sessionManager,
  providers: [google({ ... }), github({ ... })],
  onSignIn: async ({ profile, provider }) => ({ userId: "..." }),
});
```

The helper is intentionally thin — it just wraps `defineAuth`. Consumers wanting full control should call `defineAuth` directly from `@theokit/sdk/server/auth`.

## Profile types

See each provider README for the full profile shape:

- [`GoogleProfile`](../auth-google#profile-shape) — `sub` case-sensitive per ADR D9
- [`GitHubProfile`](../auth-github#profile-shape) — `id` is `number`, NOT string
- [`MagicLinkProfile`](../auth-magic-link#profile-shape) — `{ email, verifiedAt }`

## License

MIT — see [LICENSE](./LICENSE).
