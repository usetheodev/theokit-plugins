---
"@theokit/plugin-db-drizzle": patch
---

`db seed` now runs the user's seed script instead of a nonexistent `drizzle-kit seed` subcommand (#170). `DbCommand` gains a `kind: "drizzle-kit" | "user-script"` discriminant; `seed` is `kind: "user-script"` and its `buildArgs` returns the configured `seedScript` path (the runner executes it as a script). A new optional `seedScript` option (settable on `drizzleDb(...)` or resolved at register-time from `package.json#theokit.db.seed`) supplies the path; when none is configured, `db seed` throws a clear error rather than spawning a subcommand that does not exist. Additive — every other verb stays `kind: "drizzle-kit"`.
