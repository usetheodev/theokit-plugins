---
"@theokit/auth-magic-link": minor
---

**BREAKING (pre-1.0, data format):** magic-link tokens are now hashed (SHA-256) before storage — the built-in memory and ORM stores persist `sha256(token)` instead of the raw token, so a store/DB/log leak no longer exposes live credentials (#191). The `MagicLinkStore`/`MagicLinkRepository` interfaces are unchanged (they still receive the raw token; hashing is internal); only the persisted value changes. Existing un-consumed plaintext rows from a prior version will no longer match and will expire naturally within the token TTL (≤15 min default) — no live credential is stranded.

Also documents (#190) that magic-link tokens are intentionally **unbound bearer credentials** (cross-device by design): `handleCallback` does not validate the OAuth `tx.state`, because magic-link has no redirect round-trip and the click may land on a different device. Security rests on token entropy + short TTL + single-use + hash-at-rest. This supersedes the plan's ADR D6 (which proposed tx.state binding on a false premise).
