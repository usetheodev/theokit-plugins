/**
 * RED tests for P#5 T2.2 — devtools-tab hook
 *
 * Per plan p5-plugin-db-drizzle v1.0 § Phase 2 / T2.2. Blueprint ADR D2 —
 * studio passthrough + optional IFRAMEs the studio URL when overlay present.
 */
import { describe, expect, it } from "vitest";

import { buildDevtoolsTab } from "../src/devtools.js";
import { resolveOptions } from "../src/options.js";

describe("buildDevtoolsTab (P#5 T2.2)", () => {
  it("returns descriptor with id='db-studio' and label='Database'", () => {
    // Given: resolved opts
    const opts = resolveOptions({ driver: "sqlite", url: ":memory:" });

    // When: tab built
    const tab = buildDevtoolsTab(opts);

    // Then: descriptor matches the canonical shape
    expect(tab.id).toBe("db-studio");
    expect(tab.label).toBe("Database");
  });

  it("returns descriptor with studioUrl pointing at drizzle-kit's default port", () => {
    // Given: any resolved opts
    const opts = resolveOptions({ driver: "sqlite", url: ":memory:" });

    // When: tab built
    const tab = buildDevtoolsTab(opts);

    // Then: studio URL is the drizzle-kit default
    expect(tab.studioUrl).toBe("http://localhost:4983");
  });

  it("mount() creates an IFRAME pointing at studioUrl inside the container", () => {
    // Given: a fake DOM container (vitest happy-dom would normally do this;
    // we keep test runtime as node + minimal stub to avoid happy-dom dep)
    const iframes: Array<{ src?: string; title?: string }> = [];
    const container = {
      ownerDocument: {
        createElement: (tag: string) => {
          if (tag !== "iframe") throw new Error(`unexpected element ${tag}`);
          const stub: { src?: string; title?: string; style: Record<string, string> } = {
            style: {},
          };
          iframes.push(stub);
          return stub as unknown as HTMLElement;
        },
      },
      replaceChildren: (..._children: Element[]) => {
        // Capture the call but no-op the DOM mutation
      },
    } as unknown as HTMLElement;

    // When: mount called
    const tab = buildDevtoolsTab(resolveOptions({ driver: "sqlite", url: ":memory:" }));
    tab.mount(container);

    // Then: one IFRAME created with correct src + title
    expect(iframes).toHaveLength(1);
    expect(iframes[0]?.src).toBe("http://localhost:4983");
    expect(iframes[0]?.title).toBe("Drizzle Studio");
  });

  it("returns a fresh descriptor on each call (independent mount closures)", () => {
    // Given: two calls
    const opts = resolveOptions({ driver: "sqlite", url: ":memory:" });
    const tabA = buildDevtoolsTab(opts);
    const tabB = buildDevtoolsTab(opts);

    // Then: descriptors are distinct objects (no shared mutable state)
    expect(tabA).not.toBe(tabB);
    expect(tabA.mount).not.toBe(tabB.mount);
    // But shape is identical
    expect(tabA.id).toBe(tabB.id);
    expect(tabA.studioUrl).toBe(tabB.studioUrl);
  });
});
