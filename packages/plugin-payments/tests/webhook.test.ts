/**
 * RED tests for P#6 T2.1 + T2.2 — webhook dispatcher + signature verification
 *
 * Per plan p6-plugin-payments v1.0 § Phase 2 / T2.1 + T2.2.
 */
import { describe, expect, it } from "vitest";
import type Stripe from "stripe";

import {
  defineStripeWebhook,
  processWebhook,
  StripeSignatureError,
  verifyAndParseWebhook,
  WebhookRegistry,
} from "../src/webhook.js";
import { createMemoryStore } from "../src/idempotency-store.js";

// Helper: build a fake Stripe.Event for dispatcher tests (does NOT exercise
// signature verification path).
function fakeEvent<T extends Stripe.Event["type"]>(
  type: T,
  id = `evt_${Math.random().toString(36).slice(2)}`,
): Stripe.Event {
  return {
    id,
    type,
    object: "event",
    api_version: "2023-10-16",
    created: Math.floor(Date.now() / 1000),
    data: { object: {} as never },
    livemode: false,
    pending_webhooks: 0,
    request: { id: null, idempotency_key: null },
  } as Stripe.Event;
}

describe("defineStripeWebhook + WebhookRegistry (P#6 T2.1)", () => {
  it("registers and dispatches a handler for a specific event type", async () => {
    const registry = new WebhookRegistry();
    let invokedWith: Stripe.Event | null = null;

    const handler = defineStripeWebhook(
      "checkout.session.completed",
      async (event) => {
        invokedWith = event;
      },
    );
    registry.register(handler);

    const event = fakeEvent("checkout.session.completed");
    await registry.dispatch(event);

    expect(invokedWith).toBe(event);
  });

  it("does NOT invoke handlers for unmatched event types (no-op, no error)", async () => {
    const registry = new WebhookRegistry();
    let invoked = false;

    registry.register(
      defineStripeWebhook("checkout.session.completed", async () => {
        invoked = true;
      }),
    );

    // Dispatch a different event type
    await registry.dispatch(fakeEvent("payment_intent.succeeded"));
    expect(invoked).toBe(false);
  });

  it("multiple handlers for same event type run in LIFO order", async () => {
    const registry = new WebhookRegistry();
    const order: string[] = [];

    registry.register(
      defineStripeWebhook("checkout.session.completed", async () => {
        order.push("first");
      }),
    );
    registry.register(
      defineStripeWebhook("checkout.session.completed", async () => {
        order.push("second");
      }),
    );

    await registry.dispatch(fakeEvent("checkout.session.completed"));

    // LIFO: last registered runs first
    expect(order).toEqual(["second", "first"]);
  });

  it("handler throwing propagates the error to the dispatcher caller", async () => {
    const registry = new WebhookRegistry();
    registry.register(
      defineStripeWebhook("checkout.session.completed", async () => {
        throw new Error("user handler failed");
      }),
    );

    await expect(
      registry.dispatch(fakeEvent("checkout.session.completed")),
    ).rejects.toThrow("user handler failed");
  });

  it("hasHandlersFor reports registration state", () => {
    const registry = new WebhookRegistry();
    expect(registry.hasHandlersFor("checkout.session.completed")).toBe(false);

    registry.register(
      defineStripeWebhook("checkout.session.completed", async () => {}),
    );
    expect(registry.hasHandlersFor("checkout.session.completed")).toBe(true);
  });
});

describe("verifyAndParseWebhook (P#6 T2.2)", () => {
  it("returns the parsed event when signature is valid", async () => {
    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe("sk_test_xxx", { apiVersion: "2023-10-16" });
    const secret = "whsec_test_xxx";
    const payload = JSON.stringify({
      id: "evt_test_signed",
      type: "checkout.session.completed",
      data: { object: {} },
    });
    const header = stripe.webhooks.generateTestHeaderString({ payload, secret });

    const event = verifyAndParseWebhook(stripe, payload, header, secret);
    expect(event.id).toBe("evt_test_signed");
    expect(event.type).toBe("checkout.session.completed");
  });

  it("throws StripeSignatureError when signature header is missing", async () => {
    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe("sk_test_xxx", { apiVersion: "2023-10-16" });

    expect(() =>
      verifyAndParseWebhook(stripe, "{}", undefined, "whsec_xxx"),
    ).toThrow(StripeSignatureError);
  });

  it("throws StripeSignatureError when body is tampered", async () => {
    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe("sk_test_xxx", { apiVersion: "2023-10-16" });
    const secret = "whsec_test_xxx";
    const payload = JSON.stringify({ id: "evt_signed", type: "test.event" });
    const header = stripe.webhooks.generateTestHeaderString({ payload, secret });

    // Tamper the body
    const tampered = payload.replace("evt_signed", "evt_TAMPERED");
    expect(() =>
      verifyAndParseWebhook(stripe, tampered, header, secret),
    ).toThrow(StripeSignatureError);
  });
});

describe("processWebhook (P#6 T2.1 + T2.2 + T2.3 integration)", () => {
  it("returns ok+duplicate=false on first delivery of a new event", async () => {
    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe("sk_test_xxx", { apiVersion: "2023-10-16" });
    const secret = "whsec_xxx";
    const payload = JSON.stringify({
      id: "evt_first_delivery",
      type: "checkout.session.completed",
      data: { object: {} },
    });
    const header = stripe.webhooks.generateTestHeaderString({ payload, secret });

    const registry = new WebhookRegistry();
    let invocations = 0;
    registry.register(
      defineStripeWebhook("checkout.session.completed", async () => {
        invocations += 1;
      }),
    );

    const result = await processWebhook({
      stripe,
      rawBody: payload,
      signatureHeader: header,
      webhookSecret: secret,
      registry,
      store: createMemoryStore(),
    });

    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.duplicate).toBe(false);
      expect(result.eventId).toBe("evt_first_delivery");
    }
    expect(invocations).toBe(1);
  });

  it("returns ok+duplicate=true on second delivery (idempotency)", async () => {
    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe("sk_test_xxx", { apiVersion: "2023-10-16" });
    const secret = "whsec_xxx";
    const payload = JSON.stringify({
      id: "evt_dup_delivery",
      type: "checkout.session.completed",
      data: { object: {} },
    });
    const header = stripe.webhooks.generateTestHeaderString({ payload, secret });

    const registry = new WebhookRegistry();
    let invocations = 0;
    registry.register(
      defineStripeWebhook("checkout.session.completed", async () => {
        invocations += 1;
      }),
    );
    const store = createMemoryStore();

    // First delivery
    await processWebhook({
      stripe,
      rawBody: payload,
      signatureHeader: header,
      webhookSecret: secret,
      registry,
      store,
    });

    // Second delivery (Stripe retry)
    const result = await processWebhook({
      stripe,
      rawBody: payload,
      signatureHeader: header,
      webhookSecret: secret,
      registry,
      store,
    });

    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.duplicate).toBe(true);
    }
    // Handler invoked exactly once total despite two deliveries
    expect(invocations).toBe(1);
  });

  it("returns signature_invalid when body is tampered", async () => {
    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe("sk_test_xxx", { apiVersion: "2023-10-16" });
    const secret = "whsec_xxx";
    const payload = JSON.stringify({
      id: "evt_orig",
      type: "checkout.session.completed",
    });
    const header = stripe.webhooks.generateTestHeaderString({ payload, secret });
    const tampered = payload.replace("evt_orig", "evt_HACKED");

    const result = await processWebhook({
      stripe,
      rawBody: tampered,
      signatureHeader: header,
      webhookSecret: secret,
      registry: new WebhookRegistry(),
      store: createMemoryStore(),
    });

    expect(result.status).toBe("signature_invalid");
  });

  it("returns handler_error when consumer's handler throws", async () => {
    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe("sk_test_xxx", { apiVersion: "2023-10-16" });
    const secret = "whsec_xxx";
    const payload = JSON.stringify({
      id: "evt_handler_error",
      type: "checkout.session.completed",
      data: { object: {} },
    });
    const header = stripe.webhooks.generateTestHeaderString({ payload, secret });

    const registry = new WebhookRegistry();
    registry.register(
      defineStripeWebhook("checkout.session.completed", async () => {
        throw new Error("DB write failed");
      }),
    );

    const result = await processWebhook({
      stripe,
      rawBody: payload,
      signatureHeader: header,
      webhookSecret: secret,
      registry,
      store: createMemoryStore(),
    });

    expect(result.status).toBe("handler_error");
    if (result.status === "handler_error") {
      expect(result.eventId).toBe("evt_handler_error");
      expect((result.error as Error).message).toBe("DB write failed");
    }
  });
});
