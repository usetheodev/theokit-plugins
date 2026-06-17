---
"@theokit/plugin-db-drizzle": patch
---

Add the documented destructive-op guard for `db reset` (#168). The `reset` command descriptor now carries `requiresForce: true`, so the CLI runner refuses to execute it unless the user passes `--force`. The `DbCommand` interface gains an optional `requiresForce` field (additive). Note: the descriptor declares the requirement; the actual refusal is enforced by the CLI runner (which has the user's argv) — the pure `buildDbCommands` factory has no access to invocation flags.
