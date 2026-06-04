/**
 * RED tests for P#6 T1.2 — payments() factory
 *
 * Per plan p6-plugin-payments v1.0 § Phase 1 / T1.2.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { payments } from "../src/index.js";

const ENV_KEYS = ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"] as const;
const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = savedEnv[key];
    }
  }
});

describe("payments() factory (P#6 T1.2)", () => {
  it("returns a TheoPlugin shape with name + kind + register + getStripeClient", () => {
    // Given: minimum options (secretKey passed explicitly)
    const plugin = payments({ secretKey: "sk_test_xxx" });

    // Then: canonical plugin shape
    expect(plugin.name).toBe("@theokit/plugin-payments");
    expect(plugin.kind).toBe("payments");
    expect(typeof plugin.register).toBe("function");
    expect(typeof plugin.getStripeClient).toBe("function");
  });

  it("defaults apiVersion to '2023-10-16'", () => {
    const plugin = payments({ secretKey: "sk_test_xxx" });
    expect(plugin.options.apiVersion).toBe("2023-10-16");
  });

  it("accepts explicit apiVersion override", () => {
    const plugin = payments({
      secretKey: "sk_test_xxx",
      apiVersion: "2023-10-16",
    });
    expect(plugin.options.apiVersion).toBe("2023-10-16");
  });

  it("reads STRIPE_SECRET_KEY from env when secretKey omitted", () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_from_env";
    const plugin = payments();
    expect(plugin.options.secretKey).toBe("sk_test_from_env");
  });

  it("reads STRIPE_WEBHOOK_SECRET from env when webhookSecret omitted", () => {
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_from_env";
    const plugin = payments({ secretKey: "sk_test_xxx" });
    expect(plugin.options.webhookSecret).toBe("whsec_from_env");
  });

  it("wires a default memory idempotency store when none provided", () => {
    const plugin = payments({ secretKey: "sk_test_xxx" });
    expect(plugin.options.idempotencyStore).toBeDefined();
    expect(typeof plugin.options.idempotencyStore?.markProcessed).toBe("function");
  });
});
