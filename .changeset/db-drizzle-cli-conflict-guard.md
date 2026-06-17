---
"@theokit/plugin-db-drizzle": patch
---

Make the CLI `db`-namespace conflict guard effective (#171). Previously both branches of the `hasCliCommand("db")` check called `registerCliCommand` identically (a no-op guard). Now the conflict path warns the operator that it is extending an already-registered `db` namespace (e.g. one owned by `@theokit/orm`) before merging the drizzle verbs, so a silent namespace collision is observable. No public API change.
