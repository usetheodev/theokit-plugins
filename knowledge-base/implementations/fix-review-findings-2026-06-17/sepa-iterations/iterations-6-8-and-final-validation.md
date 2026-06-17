# SEPA — Iterations 6-8 + final validation

Model: sonnet (opus SEPA quota exhausted until 2026-06-22). All consults read
`agents/implement-fix-review-findings-2026-06-17-2026-06-17/sepa.md` as the role.

## Iteration 6 — T3.2 (F-sec-2, frameUntrusted fixpoint)

- pre-RED: GO. SEPA confirmed the fixpoint loop is correct + terminates (each
  changing pass strictly shrinks the string), and identified the cross-marker
  reconstruction case (OPEN strip can synthesize a CLOSE) → 4 vectors A/B/C/D.
- post-GREEN: GO. Loop correct, oracle `split(MARKER).length-1===1` tight (no
  false pass/fail). Vector C is a regression guard (single-pass sequential strip
  already caught cross-marker). Residual casing/homoglyph bypass OUT of scope for
  F-sec-2 (which is specifically marker reconstruction via nesting).
- pre-COMMIT: GO. CHANGELOG/changeset accurate; scope clean; commit 3cd718a.

## Iteration 7 — T3.3 (F-sec-3, remove 0.0.0.0 from isLoopbackHost)

- pre-RED: GO. Key facts: removing only `"0.0.0.0"` is complete because URL
  parsing normalizes `http://0/` → hostname `0.0.0.0` (so the short form is
  rejected by the same omission); IPv6 unspecified `[::]` was never exempt;
  localhost regression covered by the existing over-blocking test. → 2 vectors.
- post-GREEN + pre-COMMIT (combined): GO. Diff closes the finding (exemption set
  now localhost/[::1]/::1 + 127/8 regex); both new tests reject + assert no
  client_secret POST fired; CHANGELOG/changeset accurate; commit 298e5d6.

## Iteration 8 — T4.1 (F-dom-pay-5, redact releaseError in log)

- pre-RED: GO. Control flow confirmed: markProcessed→true → dispatch throws →
  release throws → vulnerable log fires. Strongest oracle = secret absent + log
  fired + `***REDACTED***` marker present (anti-vacuous-pass).
- post-GREEN + pre-COMMIT (combined): GO. `redactSecrets(releaseError)` mirrors
  the handler-error path; test sound; CHANGELOG/changeset accurate; commit c43d8e6.

## Final validation (Integration Validation phase)

- plugin-canvas 217 pass; plugin-copilot 92 pass (+1 skip); auth-google 25 pass;
  plugin-payments 60 pass.
- tsc: 0 NEW across all 4 affected packages. The 6 plugin-canvas tsc errors are
  pre-existing baseline in `src/ui/renderers/markdown.tsx` + `tests/use-canvas.test.tsx`
  (untouched by this plan; only sanitize.ts/sanitize.test.ts were edited in canvas).
- lint: 0 NEW (per-file current==HEAD baseline for every edited source file).
- Phase 3 mini-review: PHASE_REVIEW_PASS (max MEDIUM).
- Phase 4 mini-review: PHASE_REVIEW_PASS (max MEDIUM).

All 8 tasks committed. The 4 review HIGH findings (F-wire-1, F-arch-1/F-sec-1,
F-arch-2, F-tests-1) + the 4 owned MEDIUM/LOW (F-sec-2, F-conc-2, F-sec-3,
F-dom-pay-5) are resolved. Backlogged (per owner decision, pre-existing/not-owned):
F-conc-1, F-conc-3, F-arch-5.
