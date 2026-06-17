# SEPA pre-COMMIT — iter 4 — T1.4 — VERDICT: CLEAN
- Conventional commit + #179 + #180 + Wiring line.
- Scope = sanitize.ts + sanitize.test.ts + CHANGELOG (no creep; sanitizeHtmlSrcdoc untouched; no schema.ts).
- Post-GREEN APPROVE: zero protections dropped (each regex mapped to DOMPurify config or hook); verdict from removed[]; try/finally removeHook; sync-invariant documented.
- #186 (Phase 9 classifyRemovals CC) likely resolved incidentally — re-measure at Phase 9.
- No CRITICAL. Cleared.
