/**
 * RED tests for P#5 T1.3 — register(app) lifecycle wiring
 *
 * Per plan p5-plugin-db-drizzle v1.0 § Phase 1 / T1.3. Blueprint Form 4
 * Hybrid plugin shape proposal.
 */
import { describe, expect, it, vi } from "vitest";

import { drizzleDb } from "../src/index.js";
import type { TheoPluginApp } from "../src/types.js";

function makeApp(overrides: Partial<TheoPluginApp> = {}): TheoPluginApp & {
  cliCommands: Map<string, unknown>;
  devtoolsTabs: unknown[];
} {
  const cliCommands = new Map<string, unknown>();
  const devtoolsTabs: unknown[] = [];
  return {
    cliCommands,
    devtoolsTabs,
    registerCliCommand: vi.fn((ns: string, cmds: unknown) => {
      cliCommands.set(ns, cmds);
    }),
    registerDevtoolsTab: vi.fn((tab: unknown) => {
      devtoolsTabs.push(tab);
    }),
    hasCliCommand: vi.fn((ns: string) => cliCommands.has(ns)),
    ...overrides,
  };
}

describe("drizzleDb register(app) lifecycle (P#5 T1.3)", () => {
  it("registers the 'db' CLI namespace", () => {
    // Given: a fresh mock app
    const app = makeApp();
    const plugin = drizzleDb({ driver: "sqlite", url: ":memory:" });

    // When: plugin registered
    plugin.register(app);

    // Then: 'db' namespace is in the CLI registry
    expect(app.cliCommands.has("db")).toBe(true);
    expect(app.registerCliCommand).toHaveBeenCalledOnce();
  });

  it("registers a devtools tab by default (devtoolsTab=true)", () => {
    // Given: app with devtools-overlay hook available
    const app = makeApp();
    const plugin = drizzleDb({ driver: "sqlite", url: ":memory:" });

    // When: plugin registered
    plugin.register(app);

    // Then: a devtools tab descriptor was registered
    expect(app.devtoolsTabs).toHaveLength(1);
    expect(app.registerDevtoolsTab).toHaveBeenCalledOnce();
  });

  it("does NOT register devtools tab when devtoolsTab=false", () => {
    // Given: a plugin with opt-out
    const app = makeApp();
    const plugin = drizzleDb({
      driver: "sqlite",
      url: ":memory:",
      devtoolsTab: false,
    });

    // When: registered
    plugin.register(app);

    // Then: no tab registered
    expect(app.devtoolsTabs).toHaveLength(0);
    expect(app.registerDevtoolsTab).not.toHaveBeenCalled();
  });

  it("does NOT register devtools tab when app lacks registerDevtoolsTab (graceful no-op)", () => {
    // Given: an app without the devtools hook (overlay absent)
    const app = makeApp({ registerDevtoolsTab: undefined });
    const plugin = drizzleDb({ driver: "sqlite", url: ":memory:" });

    // When: registered
    plugin.register(app);

    // Then: no throw + CLI still works
    expect(app.cliCommands.has("db")).toBe(true);
    expect(app.devtoolsTabs).toHaveLength(0);
  });

  it("does NOT throw when app lacks registerCliCommand (graceful no-op)", () => {
    // Given: an app without the CLI hook
    const app = makeApp({ registerCliCommand: undefined, hasCliCommand: undefined });
    const plugin = drizzleDb({ driver: "sqlite", url: ":memory:" });

    // Then: register() does not throw
    expect(() => plugin.register(app)).not.toThrow();
  });
});
