# Code-Quality Audit — remediate-code-review-2026-06-16

**Date:** 2026-06-17 · **Mode:** standalone (Mode 1) · **Runner:** `.claude/skills/code-quality/scripts/run_code_quality.py`

> Mode 2 (plan-bound) was unavailable: the runner resolves the plan under `.claude/knowledge-base/plans/`, but this project keeps plans at repo-root `knowledge-base/plans/` (split layout). Mode 1 still runs the load-bearing HARD-cap detectors (D1 dead code, D2 symbol fabrication) + D3 orphan exports. D4 mutation testing (Mode 2, soft cap, scoped to `## Critical paths`) was not run — impractical on a multi-package TS monorepo via stryker and a soft cap only.
>
> The project's `.claude/rules/code-quality-languages.txt` is an unfilled template (all comments → 0 languages → vacuous PASS). This audit used the skill defaults (`skills/code-quality/defaults/languages.txt`, all 4 languages ENABLED) to get a real audit. **Backlog: populate the project languages rule with `typescript | package.json | ENABLED`.**

## Verdict: `PASS_WITH_CAVEATS` (score cap 89)

| Severity | Count |
|---|---|
| HARD | **0** |
| SOFT_CAP | **0** |
| SOFT_FLOOR | 8 |
| INFO | 0 |

- **hard_caps_triggered:** none that cap below 89 (the `symbol_fab_unverifiable_typescript` id appears, but every instance is SOFT_FLOOR, capping at 89 — there is no FAIL_HARD).
- **soft_caps_triggered:** none.

Per `cycle-code-quality.md § Verdicts`, `PASS_WITH_CAVEATS` → **proceed to `/review`; caveats logged here + in the PR description.**

## Languages

- **Audited:** typescript (manifest `package.json` at repo root).
- **Skipped (no manifest at root):** python, rust, go.

## Detectors

| Detector | Result |
|---|---|
| D1 — dead code (knip) | ✅ **0 findings** — no dead exported symbol unreachable from a caller/test. |
| D2 — symbol fabrication (tree-sitter + npm registry) | 8 × `symbol_fab_unverifiable_typescript` (**SOFT_FLOOR**) — see caveat below. **0 HARD fabrications.** |
| D3 — cross-package orphan exports (ast-grep) | ✅ no orphan-export soft caps. |
| D4 — mutation testing | not run (Mode 1; soft cap; see header note). |

## Caveat — the 8 SOFT_FLOOR `symbol_fab_unverifiable_typescript`

D2-TS v0.1 does a **package-name check** against the npm registry (member-access introspection is a documented v0.2 deferral — see `SKILL.md § Roadmap`). The repo's non-relative imports split into:

- **Verifiable on public npm (passed):** `react`, `react-hook-form`, `@hookform/resolvers`, `@react-email/components`, `stripe`, `zod`, `isomorphic-dompurify`.
- **Workspace/peer packages NOT on public npm (→ "unverifiable", SOFT_FLOOR):** `theokit` (+ subpaths like `theokit/server`, `theokit/server/auth`), `@theokit/sdk`, `@theokit/ui`, `@theokit/react`, and the sibling `@theokit/plugin-*` / `@theokit/auth-magic-link` workspace packages.

These are **not fabrications** — they are first-party workspace/peer specifiers that the npm-registry check legitimately cannot resolve. A true fabrication (a symbol that resolves to nothing in source or any dependency) would be HARD; none were found.

## Relation to the remediation

The 40-task remediation introduced **no new external dependency** — every task was a behavior-preserving refactor or a fix built on already-imported symbols (the only new imports were `node:crypto` `randomUUID` in voice STT/TTS and `zod` in copilot runtime, both pre-existing deps). D1 (dead code) is clean: the CC-reduction extractions (T9.1) and the error-routing extraction (T8.2) all have callers. No symbol fabrication.

## Handoff

`PASS_WITH_CAVEATS` ∈ {PASS, PASS_WITH_CAVEATS} → **`/review` may proceed.** Caveats: (1) 8 unverifiable workspace/peer imports (D2-TS v0.1 limitation, benign); (2) D4 mutation not run; (3) project languages rule unfilled (used defaults). None block merge.
