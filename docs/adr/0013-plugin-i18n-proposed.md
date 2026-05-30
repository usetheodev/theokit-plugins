# 0013. `@theokit/plugin-i18n` — internationalization

- Status: proposed
- Date: 2026-05-27
- Target implementation start: ≤ 6 weeks after `@theokit/plugin-cors@0.1.0` npm release
- Target ship: 2026-Q4

## Context

[ADR-0011 (TheoKit core)](https://github.com/usetheodev/theokit/blob/main/docs/adr/0011-moderate-plugin-roadmap-strategy.md) D4 commits to shipping `@theokit/plugin-i18n` as the third first-party plugin. This stub ADR registers the commitment + target dates and captures open questions.

This ADR is intentionally **light** — full implementation ADR replaces it when work starts.

## Decision (to be drafted at implementation time)

A plugin that adds internationalization to TheoKit apps:

- Locale detection (`Accept-Language` header → matched locale from configured set)
- Translation lookup helper (`ctx.t('key')` or similar)
- Server-side rendering of translated content; optional client-side hydration
- Lazy locale loading per route (avoid shipping all locales in initial bundle)

## Open questions (to resolve at implementation time)

1. **Translation file format.** JSON (universal), PO (gettext, mature tooling), ICU MessageFormat (rich plurals/dates)? ICU is most powerful but heaviest. JSON probably fits 80% of cases.
2. **Routing strategy.** Path-based (`/en/users`, `/pt/usuarios`)? Query-string (`?lang=en`)? Subdomain (`en.app.com`)? Cookie? Header-based detection only? Different apps want different. Plugin should support pluggable routing strategies.
3. **Translation key lookup.** Static (build-time validation that key exists) or dynamic (runtime fallback to key string)? Static is safer; requires build-step integration.
4. **Lazy loading.** How does the plugin instruct TheoKit's router to lazy-load locale bundles? Hook into `vite-plugin/` or stay client-side only?
5. **React component integration.** Does the plugin expose React hooks (`useTranslation`)? That couples to React; TheoKit's UI layer is React-first but the plugin SDK is rendering-agnostic. Maybe two packages: `@theokit/plugin-i18n` (server) + `@theokit/plugin-i18n-react` (hooks)?
6. **Number/date formatting.** Use `Intl.NumberFormat` / `Intl.DateTimeFormat` directly (browser native)? Or wrap with formatjs/luxon? Native first; wrap only if pain emerges.
7. **Existing libraries.** Should the plugin wrap `i18next`, `lingui`, or `next-intl` rather than reinvent? Wrap is safer (mature) but bundle inflation. Inventing is leaner. Decision pending size/feature comparison at implementation start.

## Status notes

This ADR is **intentionally light**. The 7 open questions above represent significant design surface — full ADR will land with the implementation PR once those are resolved.

## Related ADRs

- [ADR-0011 (TheoKit core)](https://github.com/usetheodev/theokit/blob/main/docs/adr/0011-moderate-plugin-roadmap-strategy.md) — moderate plugin roadmap; commits to this plugin with temporal gate (≤ 6 weeks)
- [ADR-0008 (TheoKit core)](https://github.com/usetheodev/theokit/blob/main/docs/adr/0008-theoplugin-is-the-canonical-sdk.md) — `TheoPlugin` is the SDK this plugin uses
- ADR-0012 (sibling) — `@theokit/plugin-sentry` (proposed)

## References

- ICU MessageFormat — https://formatjs.io/docs/intl-messageformat
- i18next — https://www.i18next.com/
- lingui — https://lingui.dev/
- next-intl — https://next-intl-docs.vercel.app/
- TheoKit roadmap entry — [`ROADMAP.md`](../../ROADMAP.md) → Committed table
