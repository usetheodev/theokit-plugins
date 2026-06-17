# SEPA — Iteration 5 (T3.1, F-arch-1/F-sec-1) — post-GREEN + pre-COMMIT

Model: sonnet (opus SEPA quota exhausted until 2026-06-22).

## post-GREEN — VERDICT: GO

Reviewed diff of `sanitize.ts` + `sanitize.test.ts`.

- WHOLE_DOCUMENT:true is correct AND more faithful: a browser parses an iframe
  `srcdoc` as a full document, hoisting `<meta>` into `<head>` where the refresh
  fires. Body-fragment parsing silently DROPS `<meta>` before DOMPurify can
  record the removal — so the verdict would miss it (and DID, regressing the two
  previously-green quoted-meta tests in schema.test.ts + route-handlers.test.ts
  until WHOLE_DOCUMENT was added). Quoted meta: no regression. Output wrapping in
  `<html><head><body>` is semantically neutral for the sole `output` consumer
  (`html-artifact.tsx` srcDoc) — the browser auto-wraps fragments regardless.
- OR-fold into `removedScript` is sound: `enforceArtifactSecurity` (schema.ts)
  checks ONLY `removedScript` for the html kind; without the fold an iframe/
  on-handler removal would leave `removedScript=false` and pass a dangerous
  artifact. Precision-over-recall trade-off documented; no current caller reads
  the individual flags to distinguish vector classes.
- Tests cover the core regression (unquoted meta) + iframe + on-handler + clean.
  SEPA flagged two implicit-only vectors → added `test_script_tag_srcdoc_is_flagged`
  and `test_javascript_url_srcdoc_is_flagged` (21 sanitize tests pass).

## pre-COMMIT — VERDICT: GO

- CHANGELOG `### Fixed` entry: accurate, consumer-facing, cites F-arch-1/F-sec-1,
  no overclaim ("No public API change" correctly lives in the changeset).
- Changeset: `@theokit/plugin-canvas` patch, accurate body.
- Scope: exactly the 4 T3.1 files; SEPA iteration logs NOT staged.
- Commit message: `fix(plugin-canvas): derive srcdoc security verdict from DOMPurify output, not regex (F-arch-1, F-sec-1)` — no Co-Authored-By trailer.

Committed: d173838.
