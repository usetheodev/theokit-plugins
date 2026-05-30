# @usetheo/plugin-cors

> CORS (Cross-Origin Resource Sharing) plugin for [TheoKit](https://github.com/usetheodev/theokit). Implements the W3C CORS spec — preflight short-circuit, dynamic origin matching, `Vary: Origin` for caching correctness.

## Installation

```bash
pnpm add @usetheo/plugin-cors
# or: npm install @usetheo/plugin-cors
# or: yarn add @usetheo/plugin-cors
```

Requires `theokit >= 0.1.0-alpha.5` as a peer dependency.

## Quick start

```ts
// theo.config.ts
import { defineConfig } from 'theokit'
import cors from '@usetheo/plugin-cors'

export default defineConfig({
  plugins: [
    cors({
      origin: ['https://app.example.com'],
      credentials: true,
    }),
  ],
})
```

That's it. Preflight `OPTIONS` requests are short-circuited with `204` + CORS headers; normal responses get the headers added in `onResponse`.

## Options reference

| Option                 | Type                                                          | Default                                             | Description                                                           |
| ---------------------- | ------------------------------------------------------------- | --------------------------------------------------- | --------------------------------------------------------------------- |
| `origin`               | `string \| string[] \| ((origin: string) => boolean) \| true` | `'*'`                                               | Origin matcher. See [Origin matching](#origin-matching).              |
| `methods`              | `string[]`                                                    | `['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE']` | Methods sent in `Access-Control-Allow-Methods` (preflight only).      |
| `allowedHeaders`       | `string[]`                                                    | (echoes request `Access-Control-Request-Headers`)   | Headers sent in `Access-Control-Allow-Headers` (preflight only).      |
| `exposedHeaders`       | `string[]`                                                    | `undefined` (header omitted)                        | Headers sent in `Access-Control-Expose-Headers`.                      |
| `credentials`          | `boolean`                                                     | `false`                                             | Set `Access-Control-Allow-Credentials: true` when matched.            |
| `maxAge`               | `number` (seconds)                                            | `undefined` (header omitted)                        | Cache preflight response for N seconds.                               |
| `preflightContinue`    | `boolean`                                                     | `false`                                             | If `true`, do NOT short-circuit preflight; let the handler run after. |
| `optionsSuccessStatus` | `number` (200-299)                                            | `204`                                               | Status code for preflight short-circuit.                              |

## Origin matching

`origin` accepts four forms:

```ts
cors({ origin: '*' }) // wildcard — any origin (no credentials per W3C)
cors({ origin: 'https://app.example.com' }) // exact match
cors({ origin: ['https://a.com', 'https://b.com'] }) // allowlist
cors({ origin: (o) => o.endsWith('.example.com') }) // predicate
cors({ origin: true }) // echo any request origin
```

**`Vary: Origin` is automatically added** when origin is dynamic (array, predicate, or `true`) — required for HTTP caching correctness (otherwise a proxy may serve one origin's response to another).

**Request origins are case-sensitive.** Browsers always send lowercase `scheme + host + port` without trailing slash. Configure your `origin` option to match that exact format:

```ts
// ❌ Wrong — browsers never send trailing slash
cors({ origin: 'https://app.example.com/' })

// ✅ Correct
cors({ origin: 'https://app.example.com' })
```

## Security notes

### `origin: '*'` + `credentials: true` is **forbidden by the W3C spec**

The plugin **throws at construction time** if you pass both:

```ts
cors({ origin: '*', credentials: true })
// throws: [@usetheo/plugin-cors] Invalid options: `origin: '*'` with `credentials: true`
// is forbidden by the CORS spec (browsers will reject the response). Use a
// specific origin string, an allowlist array, or `(origin) => true` predicate
// to echo the request origin.
```

Workaround: use `origin: true` to echo the request origin (allows any origin individually, complies with the spec).

### Regex origins are **not supported**

Pass a predicate function instead. Regex origins historically generate CVEs (overpermissive patterns); predicates are type-safe and explicit:

```ts
// ❌ Not supported
cors({ origin: /\.example\.com$/ }) // TypeScript error

// ✅ Predicate form
cors({ origin: (o) => o.endsWith('.example.com') })
```

### Predicate exceptions are caught (do not 500 every request)

If your predicate throws (e.g., due to a typo or runtime error), the plugin treats it as a no-match (no CORS headers added) and logs a warning **once per process**. Your app keeps serving requests — only CORS is silently disabled for the failed paths.

## Migrating from Express `cors`

| Express `cors` option                | `@usetheo/plugin-cors` equivalent     | Notes                                         |
| ------------------------------------ | ------------------------------------- | --------------------------------------------- |
| `origin: '*'`                        | `origin: '*'`                         | Same. Forbidden with credentials.             |
| `origin: 'https://a.com'`            | `origin: 'https://a.com'`             | Same.                                         |
| `origin: [/\.a\.com$/]`              | `origin: (o) => o.endsWith('.a.com')` | Regex → predicate (security).                 |
| `origin: (req, cb) => cb(null, ...)` | `origin: (origin) => boolean`         | Callback → sync predicate. No request access. |
| `origin: true`                       | `origin: true`                        | Same.                                         |
| `methods: 'GET,POST'`                | `methods: ['GET', 'POST']`            | String → array (type safety).                 |
| `allowedHeaders: 'X-Foo'`            | `allowedHeaders: ['X-Foo']`           | String → array.                               |
| `exposedHeaders: 'X-Foo'`            | `exposedHeaders: ['X-Foo']`           | String → array.                               |
| `credentials: true`                  | `credentials: true`                   | Same.                                         |
| `maxAge: 600`                        | `maxAge: 600`                         | Same.                                         |
| `preflightContinue: false`           | `preflightContinue: false`            | Same (default).                               |
| `optionsSuccessStatus: 204`          | `optionsSuccessStatus: 204`           | Same (default).                               |

## Architecture & decisions

- [ADR-0008 (TheoKit core)](https://github.com/usetheodev/theokit/blob/main/docs/adr/0008-theoplugin-is-the-canonical-sdk.md) — `TheoPlugin` is the canonical SDK
- [ADR-0011 (TheoKit core)](https://github.com/usetheodev/theokit/blob/main/docs/adr/0011-moderate-plugin-roadmap-strategy.md) — moderate plugin roadmap; `@usetheo/plugin-cors` is the first shipping plugin

## License

MIT — same as TheoKit core. See [LICENSE](./LICENSE).
