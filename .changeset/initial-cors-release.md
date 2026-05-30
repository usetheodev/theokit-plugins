---
'@theokit/plugin-cors': minor
---

Initial release. Adds CORS plugin for TheoKit handling preflight (OPTIONS short-circuit with 204), origin matching (string / array / predicate / `true`), credentials, exposed/allowed headers, max-age, and `Vary: Origin` for dynamic origins.

Implements the W3C CORS spec end-to-end and rejects the insecure `origin: '*'` + `credentials: true` combination at construction time with an actionable error. Regex origins are intentionally not supported — use `(origin) => boolean` predicates instead (see ADR-D3 of the implementation plan).

Plugin is pure TS (zero runtime deps besides `zod` for validation). Requires `theokit >=0.1.0-alpha.5` as a peer dependency. See README for usage, options reference, security notes, and migration guide from Express `cors`.
