# Changesets

This directory holds [Changesets](https://github.com/changesets/changesets) — per-package version bumps + changelog entries.

## Adding a changeset

When making a change that should ship in a release:

```bash
pnpm changeset
```

Pick the affected packages, the bump type (patch / minor / major), and write a short user-facing description. A markdown file appears in this directory. Commit it with your PR.

## Releasing

CI consumes pending changesets, bumps versions, updates per-package CHANGELOG.md, and publishes to npm via `changeset publish`. See `.github/workflows/release.yml`.

## Empty repo, no changesets yet

Per ADR-0008 + R0.6.5, this repo has no packages yet. First package + first changeset land together when the first plugin clears the gates documented in [README.md](../README.md).
