# Changelog

All notable changes to `@theokit/plugin-forms` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.1] - 2026-06-03

### Fixed

- `<TheoField>` browser compat: replaced `(globalThis as any).require?.(...)` lazy
  load with a static ESM import from `@theokit/ui/form-field`. The previous
  approach always failed at render (browser ESM has no `globalThis.require`),
  effectively making the styled tier unusable in v0.1.0. The fix changes the
  failure mode from "render-time throw" to "import-time module resolution
  error" when `@theokit/ui` is missing — clearer and tree-shakeable.
- Consumers without `@theokit/ui`: continue using `useTheoField()` headless hook
  (works peer-free, as documented in README cookbook 3).

## [0.1.0] - 2026-06-03

### Added

- Initial scaffold — package.json with peer-deps (react>=19, react-hook-form^7.50, @hookform/resolvers^5, zod ^3.25 || ^4, theokit>=0.2.3, @theokit/react>=1.1.0; optional @theokit/ui>=0.13.0).
