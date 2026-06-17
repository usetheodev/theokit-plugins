---
"@theokit/plugin-db-drizzle": patch
---

Forward the configured connection options to drizzle-kit (#169). For the verbs that open a database connection (`migrate`, `push`, `studio`, `check`), `buildDbCommands` now emits `--dialect <postgresql|mysql|sqlite>` (mapped from the configured `driver` — drizzle-kit's flag is `--dialect`, not `--driver`) and `--url <url>`. Previously these documented options were accepted but never reached the CLI invocation. `generate` (schema-diff only) does not receive them, and each flag is omitted when its source option is undefined (no corrupt arg vector).
