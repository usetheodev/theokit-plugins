/**
 * @theokit/plugin-auth — T7.1 meta-package tests.
 *
 * Verifies the convenience re-exports match the originating packages
 * (re-export round-trip is a common source of meta-package drift).
 */

import { describe, expect, it } from "vitest";
import * as authGoogle from "@theokit/auth-google";
import * as authGithub from "@theokit/auth-github";
import * as authMagic from "@theokit/auth-magic-link";
import * as meta from "../src/index.js";

describe("@theokit/plugin-auth — re-export integrity (T7.1)", () => {
  it("re-exports the google() factory", () => {
    expect(meta.google).toBe(authGoogle.google);
  });

  it("re-exports the github() factory", () => {
    expect(meta.github).toBe(authGithub.github);
  });

  it("re-exports the magicLink() factory + both stores", () => {
    expect(meta.magicLink).toBe(authMagic.magicLink);
    expect(meta.createMemoryStore).toBe(authMagic.createMemoryStore);
    expect(meta.createOrmStore).toBe(authMagic.createOrmStore);
  });

  it("re-exports the 3 typed error classes", () => {
    expect(meta.GoogleAuthError).toBe(authGoogle.GoogleAuthError);
    expect(meta.GitHubAuthError).toBe(authGithub.GitHubAuthError);
    expect(meta.MagicLinkAuthError).toBe(authMagic.MagicLinkAuthError);
    expect(meta.MagicLinkConfigError).toBe(authMagic.MagicLinkConfigError);
  });

  it("exports createSaasAuth helper (function shape only — sdk lazy-loaded)", () => {
    expect(typeof meta.createSaasAuth).toBe("function");
  });

  it("createSaasAuth throws an honest error when SDK lacks /server/auth subpath", async () => {
    // Linked SDK in this workspace is 1.5.0 (per pnpm.overrides) which lacks
    // /server/auth — confirms the lazy-load fallback message
    await expect(
      meta.createSaasAuth({
        session: {},
        providers: [],
      }),
    ).rejects.toThrow(/server\/auth/i);
  });
});
