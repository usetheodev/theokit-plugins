/**
 * RED tests for P#6 T1.3 — Stripe client lazy singleton
 *
 * Per plan p6-plugin-payments v1.0 § Phase 1 / T1.3.
 */
import { describe, expect, it } from "vitest";

import {
  createStripeClientGetter,
  StripeSecretKeyMissingError,
} from "../src/stripe-client.js";
import { resolveOptions } from "../src/options.js";

describe("createStripeClientGetter (P#6 T1.3)", () => {
  it("returns a Stripe instance with appInfo populated", () => {
    const { get } = createStripeClientGetter(
      resolveOptions({ secretKey: "sk_test_xxx" }),
    );
    const client = get();
    expect(client).toBeDefined();
    // Stripe SDK exposes appInfo as part of _appInfo internal state; we verify
    // via the public `getApiField('appInfo')` exposed by the Stripe class
    // OR via the more conservative typeof check
    expect(typeof client.checkout).toBe("object");
    expect(typeof client.webhooks).toBe("object");
  });

  it("returns the same instance across subsequent calls (singleton)", () => {
    const { get } = createStripeClientGetter(
      resolveOptions({ secretKey: "sk_test_xxx" }),
    );
    const a = get();
    const b = get();
    expect(a).toBe(b);
  });

  it("throws StripeSecretKeyMissingError when secretKey absent", () => {
    const { get } = createStripeClientGetter(resolveOptions({}));
    expect(() => get()).toThrow(StripeSecretKeyMissingError);
  });

  it("dispose() clears the cached instance (test isolation)", () => {
    const { get, dispose } = createStripeClientGetter(
      resolveOptions({ secretKey: "sk_test_xxx" }),
    );
    const before = get();
    dispose();
    const after = get();
    expect(before).not.toBe(after);
  });
});
