/**
 * RED tests for P#6 T2.4 — Checkout session helper + currency helpers
 */
import { describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";

import {
  CheckoutSessionMisconfigError,
  createCheckoutSession,
} from "../src/checkout.js";
import { formatAmountForDisplay, formatAmountForStripe } from "../src/currency.js";

function makeMockClient(
  sessionFactory: () => Partial<Stripe.Checkout.Session>,
): Stripe {
  return {
    checkout: {
      sessions: {
        create: vi.fn(async (..._args: unknown[]) => sessionFactory()),
      },
    },
  } as unknown as Stripe;
}

describe("createCheckoutSession (P#6 T2.4)", () => {
  it("returns {url, sessionId} when Stripe session has a URL", async () => {
    const client = makeMockClient(() => ({
      id: "cs_test_xxx",
      url: "https://checkout.stripe.com/c/pay/cs_test_xxx",
    }));

    const result = await createCheckoutSession(client, {
      mode: "payment",
      success_url: "https://app.test/success",
      cancel_url: "https://app.test/cancel",
      line_items: [],
    });

    expect(result.sessionId).toBe("cs_test_xxx");
    expect(result.url).toBe("https://checkout.stripe.com/c/pay/cs_test_xxx");
  });

  it("throws CheckoutSessionMisconfigError when session lacks URL", async () => {
    const client = makeMockClient(() => ({ id: "cs_test_no_url", url: null }));

    await expect(
      createCheckoutSession(client, {
        mode: "payment",
        line_items: [],
      }),
    ).rejects.toThrow(CheckoutSessionMisconfigError);
  });

  it("passes params through verbatim to stripe.checkout.sessions.create", async () => {
    const createSpy = vi.fn(async () => ({
      id: "cs_test_xxx",
      url: "https://checkout.stripe.com/c/pay/cs_test_xxx",
    }));
    const client = {
      checkout: { sessions: { create: createSpy } },
    } as unknown as Stripe;

    const params: Stripe.Checkout.SessionCreateParams = {
      mode: "subscription",
      success_url: "https://app.test/success",
      cancel_url: "https://app.test/cancel",
      line_items: [{ price: "price_xxx", quantity: 1 }],
      customer_email: "user@test.com",
      metadata: { userId: "u_123" },
    };

    await createCheckoutSession(client, params);
    expect(createSpy).toHaveBeenCalledWith(params);
  });
});

describe("formatAmountForStripe (P#6 T2.4 currency helper)", () => {
  it("converts decimal currency amount to integer cents", () => {
    // USD 1.50 → 150 cents
    expect(formatAmountForStripe(1.5, "USD")).toBe(150);
  });

  it("returns integer unit unchanged for zero-decimal currencies (JPY)", () => {
    // JPY has no decimal places; pass through as-is
    expect(formatAmountForStripe(1500, "JPY")).toBe(1500);
  });

  it("rounds fractional cents via Math.round (JS banker behavior)", () => {
    // USD 1.006 → 100.6 → 101 cents (clearly rounded up, unambiguous)
    expect(formatAmountForStripe(1.006, "USD")).toBe(101);
    // USD 1.004 → 100.4 → 100 cents (clearly rounded down)
    expect(formatAmountForStripe(1.004, "USD")).toBe(100);
  });
});

describe("formatAmountForDisplay (P#6 T2.4 currency helper)", () => {
  it("formats USD with $ symbol", () => {
    // en-US locale + USD currency → "$1.50"
    expect(formatAmountForDisplay(1.5, "USD")).toContain("$");
  });

  it("formats JPY without decimal point", () => {
    const formatted = formatAmountForDisplay(1500, "JPY");
    expect(formatted).not.toContain(".");
  });
});
