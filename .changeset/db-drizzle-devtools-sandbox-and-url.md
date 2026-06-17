---
"@theokit/plugin-db-drizzle": patch
---

Harden the studio devtools iframe and make its URL configurable (#206, #207). The iframe `sandbox` no longer combines `allow-scripts` with `allow-same-origin` (that pairing lets the framed page remove its own sandbox and escape) — it is now `allow-scripts` only, which is safe because studio runs on its own origin (#206). The `studioUrl` is now built from new `studioHost`/`studioPort` options (default `localhost:4983`) instead of a hardcoded constant, so a custom studio host/port is honored (#207). Both options are additive.
