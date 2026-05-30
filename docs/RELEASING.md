# Releasing

Releases use [Changesets](https://github.com/changesets/changesets) + GitHub Actions.

## Flow

1. PR adds a changeset file (e.g., `.changeset/initial-cors-release.md`)
2. PR merges to `main`
3. GH Actions release workflow opens a "Version Packages" PR auto-bumping versions + updating each package's `CHANGELOG.md`
4. Reviewer merges the Version Packages PR
5. GH Actions runs `pnpm release` → `changeset publish` → `npm publish` for each bumped package
6. Tags pushed back to `main`; npm shows the new version

## Dry-run locally

Before tagging, you can verify the tarball locally:

```bash
cd theokit-plugins
pnpm build
pnpm pack --filter @theokit/plugin-cors --pack-destination /tmp
# Inspect the produced tarball
ls /tmp/theokit-plugin-cors-*.tgz
tar -tzf /tmp/theokit-plugin-cors-*.tgz | head -20
```

Expected contents (minimal):

- `package/package.json`
- `package/README.md`
- `package/LICENSE`
- `package/dist/index.js`
- `package/dist/index.d.ts`
- `package/dist/index.js.map`

Should NOT contain:

- `package/tests/`
- `package/src/`
- `package/node_modules/`
- `package/tsconfig.json`
- `package/tsup.config.ts`

## Manual publish (escape hatch)

If GH Actions automation breaks and you need to publish manually:

```bash
cd theokit-plugins
pnpm build
pnpm version       # alias for `changeset version`
pnpm release       # alias for `pnpm build && changeset publish` — requires NPM_TOKEN env
```

You'll need `NPM_TOKEN` set locally (token with `publish` scope; do NOT commit). See [`SECRETS.md`](./SECRETS.md) for token generation steps.

## Promotion (community → first-party)

Per [ADR-0011](https://github.com/usetheodev/theokit/blob/main/docs/adr/0011-moderate-plugin-roadmap-strategy.md) + [ROADMAP.md](../ROADMAP.md), a community plugin (`@<scope>/theokit-plugin-<name>`) is promoted to first-party (`@theokit/plugin-<name>`) only when ALL of:

1. 1+ app in production using it
2. 3+ requests in GitHub discussions
3. Doesn't duplicate a core primitive
4. Maintainable (<100 LOC OR <1 week/year)
5. Tests + fixture

Promotion is opened as a discussion at `usetheodev/theokit/discussions`, NOT as a PR here.
