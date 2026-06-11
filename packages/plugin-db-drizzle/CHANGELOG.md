# @theokit/plugin-db-drizzle

## [Unreleased]

## [0.1.0] - 2026-06-04 (initial publish on `@next`)

Per plan [`p5-plugin-db-drizzle-plan.md`](../../../.claude/knowledge-base/plans/p5-plugin-db-drizzle-plan.md) v1.0 and blueprint [`p5-plugin-db-drizzle-blueprint.md`](../../../.claude/knowledge-base/discoveries/blueprints/p5-plugin-db-drizzle-blueprint.md) v1.0 (SHIPPABLE 98.8/100). Form 4 Hybrid — plugin wraps `@theokit/orm` behind a TheoKit plugin-shape factory.

### Added

- **`drizzleDb(opts: DrizzleDbOptions): DrizzleDbPlugin`** factory. Pass to `theo.config.ts > plugins: [...]`. The returned plugin carries `kind: 'db'`, resolved options, and a `register(app)` lifecycle hook.
- **Seven canonical CLI verbs** under the `db` namespace: `generate / migrate / push / studio / reset / seed / check`. Each verb shells out to `drizzle-kit` via Node `child_process.spawn` with config wired from plugin options. Blueprint ADR D3 — wasp's 7-verb sweet spot (extension over orm's existing 6).
- **`DrizzleDriver`** canonical driver name union (`'sqlite' | 'postgres' | 'mysql'`).
- **`DrizzleDbOptions`** + **`ResolvedDrizzleDbOptions`** typed option shapes. Sensible defaults: `schemaPath='./db/schema.ts'`, `migrationsPath='./db/migrations'`, `devtoolsTab=true`.
- **`buildDevtoolsTab(opts)`** descriptor exported for tests + consumers. The tab's `mount(container)` builds an IFRAME pointing at `http://localhost:4983` (drizzle-kit's default studio port). Blueprint ADR D2 — passthrough is canonical.
- **`TheoPluginApp`** structural type — minimal surface the plugin's `register()` needs. Lets the plugin run against any app object that quacks like the TheoKit plugin runner.

### Notes

- **Studio is passthrough.** No custom UI panel ships in v0.1. Blueprint ADR D2 (2/2 references converge — wasp `runStudio`, rails `dbconsole`).
- **`@theokit/orm` is a required peer.** This plugin wraps orm; it does not duplicate. Existing orm consumers (Repository / `@InjectRepository` / `@Transactional` / `OrmModule`) keep working unchanged. Migration guide in README.
- **`drizzle-kit` is an optional peer.** Runtime apps that never invoke CLI don't need it installed.
- **CLI EC-4 conflict guard.** If `@theokit/orm`'s CLI already registered the `db` namespace, the plugin extends it instead of replacing (preserves orm's 6 verbs + adds `seed`).
- **Devtools-tab is opt-in and dev-only.** When the TheoKit devtools overlay (G4) is loaded, the tab IFRAMEs drizzle-kit studio. Pass `devtoolsTab: false` to suppress. Production builds tree-shake the tab module.

### Quality gates

- 25 unit + integration tests GREEN (factory shape × 8, register lifecycle × 5, CLI verbs × 5, devtools tab × 4, lifecycle smoke × 3).
- `npx tsc --noEmit`: exit 0.
- `npx tsup src/index.ts --format esm --dts --clean`: dist `2.51 KB` JS + `4.14 KB` d.ts.
- Zero new npm packages introduced — plugin is a thin wrapper over existing orm + theokit + drizzle-orm peers.

### Quality gates (deferred to dogfood-app cohort)

- **dogfood-app smoke test** — wiring `drizzleDb({driver: 'sqlite'})` into `dogfood-app/theo.config.ts` + asserting `/api/memory` round-trip. Gated on @theokit/orm@0.1.0-next.1 + theokit@0.4.0 promote alignment ~2026-07-15.
- **Real drizzle-kit child_process spawn validation** — Phase 3 T3.2 dogfood requirement.
