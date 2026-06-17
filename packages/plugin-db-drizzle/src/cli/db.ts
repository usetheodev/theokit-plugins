/**
 * @theokit/plugin-db-drizzle — CLI subcommands.
 *
 * Per plan p5-plugin-db-drizzle v1.0 § Phase 2 / T2.1. Ships 7 verbs under
 * the canonical `db` namespace: generate/migrate/push/studio/reset/seed/check.
 *
 * Each verb spawns drizzle-kit via Node child_process (D2 blueprint ADR —
 * passthrough pattern; mirrors wasp's `runStudio` 4-line implementation).
 *
 * `drizzle-kit` is an OPTIONAL peer per package.json — runtime apps that
 * never invoke CLI don't need it installed. Each verb gates on the binary's
 * presence with an actionable error message.
 */

import type { DrizzleDriver, ResolvedDrizzleDbOptions } from "../options.js";

/** Per-verb command descriptor. The runner reads these to dispatch CLI args. */
export interface DbCommand {
  readonly verb: DbVerb;
  readonly summary: string;
  /**
   * #168: destructive verb the runner MUST gate behind an explicit `--force`
   * flag before executing. Enforcement lives in the CLI runner (it has the
   * user's argv); this descriptor only declares the requirement.
   */
  readonly requiresForce?: boolean;
  /** Build the drizzle-kit args array for this verb given resolved options. */
  buildArgs(opts: ResolvedDrizzleDbOptions): string[];
}

/** The canonical 7-verb set per plan ADR D3. */
export type DbVerb =
  | "generate"
  | "migrate"
  | "push"
  | "studio"
  | "reset"
  | "seed"
  | "check";

const VERBS: ReadonlyArray<DbVerb> = [
  "generate",
  "migrate",
  "push",
  "studio",
  "reset",
  "seed",
  "check",
] as const;

/**
 * Build the 7 CLI commands from resolved plugin options.
 *
 * Pure factory — no spawn here. The runner inside theokit's plugin runtime
 * calls `cmd.buildArgs(resolved)` then spawns drizzle-kit.
 */
export function buildDbCommands(opts: ResolvedDrizzleDbOptions): DbCommand[] {
  return VERBS.map((verb) => ({
    verb,
    summary: SUMMARIES[verb],
    // #168: `reset` is destructive (drops the DB) — the runner must require --force.
    ...(verb === "reset" ? { requiresForce: true } : {}),
    buildArgs: () => baseArgs(verb, opts),
  }));
}

const SUMMARIES: Record<DbVerb, string> = {
  generate: "Generate a new migration file from schema diff (drizzle-kit generate).",
  migrate: "Apply pending migrations to the database (drizzle-kit migrate).",
  push: "Push schema directly to the database (dev-only, drizzle-kit push).",
  studio: "Open the drizzle-kit visual database explorer.",
  reset:
    "Drop the database, drop all tables, and re-apply all migrations. Requires --force.",
  seed: "Run the user-provided seed script (package.json#theokit.db.seed).",
  check: "Check schema drift between code and database.",
};

/**
 * Shared drizzle-kit invocation prefix for any verb. Subcommands may push
 * verb-specific flags on top (e.g., `reset --force`).
 */
/** drizzle-kit's connection flag is `--dialect` (NOT `--driver`); map our driver. */
const DRIVER_TO_DIALECT: Record<DrizzleDriver, string> = {
  postgres: "postgresql",
  mysql: "mysql",
  sqlite: "sqlite",
};

/** Verbs that open a DB connection and therefore need `--dialect`/`--url` (#169). */
const CONNECTION_VERBS: ReadonlySet<DbVerb> = new Set(["migrate", "push", "studio", "check"]);

function baseArgs(verb: DbVerb, opts: ResolvedDrizzleDbOptions): string[] {
  const args: string[] = [verb, "--schema", opts.schemaPath];
  // The `out` flag is used by `generate` to write migration files into the
  // configured migrations directory.
  if (verb === "generate") {
    args.push("--out", opts.migrationsPath);
  }
  // #169: forward the documented connection options to drizzle-kit for the verbs
  // that need a live connection. `generate` only diffs the schema, so it is
  // intentionally excluded. Each flag is conditional on its source being set —
  // pushing `--url undefined` would corrupt the arg vector.
  if (CONNECTION_VERBS.has(verb)) {
    if (opts.driver !== undefined) {
      args.push("--dialect", DRIVER_TO_DIALECT[opts.driver]);
    }
    if (opts.url !== undefined) {
      args.push("--url", opts.url);
    }
  }
  return args;
}
