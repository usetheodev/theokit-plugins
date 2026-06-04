/**
 * @theokit/plugin-payments — typed webhook dispatcher.
 *
 * Per plan p6-plugin-payments v1.0 § Phase 2 / T2.1 + T2.2.
 * Blueprint ADR D1 + Q2 — `defineStripeWebhook(eventType, handler)` provides
 * type-safe `Stripe.Event` narrowing via discriminated union on `event.type`.
 */

import type Stripe from "stripe";

import type { IdempotencyStore } from "./idempotency-store.js";
import type { StripeWebhookHandler } from "./types.js";

/**
 * Error thrown when webhook signature verification fails OR raw-body access
 * is malformed.
 */
export class StripeSignatureError extends Error {
  override readonly name = "StripeSignatureError";
  constructor(message: string) {
    super(message);
  }
}

/**
 * Define a typed handler for a specific Stripe webhook event type.
 *
 * The handler receives the narrowed `Stripe.Event` variant via
 * `Extract<Stripe.Event, { type: T }>`. Example:
 *
 * ```ts
 * const onCheckoutComplete = defineStripeWebhook(
 *   "checkout.session.completed",
 *   async (event) => {
 *     // event is typed as Stripe.CheckoutSessionCompletedEvent
 *     const session = event.data.object;
 *     console.log(session.customer);
 *   },
 * );
 * ```
 *
 * Register multiple handlers with a `WebhookRegistry` instance.
 */
export function defineStripeWebhook<T extends Stripe.Event["type"]>(
  eventType: T,
  handle: (event: Extract<Stripe.Event, { type: T }>) => Promise<void>,
): StripeWebhookHandler<T> {
  return { eventType, handle };
}

/**
 * Registry for Stripe webhook handlers. Routes incoming `Stripe.Event`
 * objects to matching `defineStripeWebhook` descriptors.
 *
 * Multiple handlers may be registered for the same event type — they run
 * in LIFO order (last registered runs first). Errors in any handler
 * propagate to the caller (consumer chooses 500 vs 200).
 *
 * Unhandled event types are NO-OP (no error). This matches Stripe's
 * recommended behavior — respond 200 to acknowledge receipt even when
 * the event type isn't relevant to the consumer's domain.
 */
/**
 * Internal type-erased handler shape stored in the registry. The variance
 * of `StripeWebhookHandler<T>` over `T` (handle accepts narrowed events)
 * makes the public typed shape incompatible with a `[]` storage layout —
 * the registry stores erased handlers + casts on dispatch (safe because
 * dispatcher guarantees event.type matches eventType before calling handle).
 */
interface ErasedHandler {
  readonly eventType: string;
  readonly handle: (event: Stripe.Event) => Promise<void>;
}

export class WebhookRegistry {
  private readonly handlers = new Map<string, ErasedHandler[]>();

  register<T extends Stripe.Event["type"]>(handler: StripeWebhookHandler<T>): void {
    const bucket = this.handlers.get(handler.eventType) ?? [];
    const erased: ErasedHandler = {
      eventType: handler.eventType,
      handle: handler.handle as (event: Stripe.Event) => Promise<void>,
    };
    bucket.push(erased);
    this.handlers.set(handler.eventType, bucket);
  }

  async dispatch(event: Stripe.Event): Promise<void> {
    const bucket = this.handlers.get(event.type);
    if (!bucket || bucket.length === 0) return;
    // LIFO: most-recently-registered handler runs first.
    for (let i = bucket.length - 1; i >= 0; i--) {
      const handler = bucket[i];
      if (!handler) continue;
      await handler.handle(event);
    }
  }

  /** Test-only introspection. */
  hasHandlersFor(eventType: Stripe.Event["type"]): boolean {
    const bucket = this.handlers.get(eventType);
    return bucket !== undefined && bucket.length > 0;
  }
}

/**
 * Verify a raw webhook body's signature and parse it into a typed `Stripe.Event`.
 *
 * `rawBody` MUST be the unmodified body bytes (string). Consumer's HTTP handler
 * MUST call `await req.text()` (or equivalent) BEFORE any other body access —
 * JSON parsing before signature verification breaks the HMAC.
 *
 * Throws `StripeSignatureError` if the signature is missing or invalid.
 */
export function verifyAndParseWebhook(
  stripe: Stripe,
  rawBody: string,
  signatureHeader: string | undefined,
  webhookSecret: string,
): Stripe.Event {
  if (!signatureHeader) {
    throw new StripeSignatureError(
      "Missing stripe-signature header. Webhook MUST include the signature in the request headers.",
    );
  }
  try {
    return stripe.webhooks.constructEvent(rawBody, signatureHeader, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown signature error";
    throw new StripeSignatureError(`Webhook signature verification failed: ${message}`);
  }
}

/**
 * High-level webhook handler that combines:
 * - signature verification (`stripe.webhooks.constructEvent`)
 * - idempotency check (`store.markProcessed`)
 * - registry dispatch (route to registered handlers)
 *
 * Returns a discriminated `WebhookResult` so the HTTP layer can map to
 * status codes correctly:
 *   - `ok` (200) — event processed OR duplicate (idempotency)
 *   - `signature_invalid` (400) — reject with error message
 *   - `handler_error` (500) — consumer's handler threw
 */
export type WebhookResult =
  | { status: "ok"; eventId: string; duplicate: boolean }
  | { status: "signature_invalid"; message: string }
  | { status: "handler_error"; eventId: string; error: unknown };

export async function processWebhook(opts: {
  stripe: Stripe;
  rawBody: string;
  signatureHeader: string | undefined;
  webhookSecret: string;
  registry: WebhookRegistry;
  store: IdempotencyStore;
}): Promise<WebhookResult> {
  let event: Stripe.Event;
  try {
    event = verifyAndParseWebhook(
      opts.stripe,
      opts.rawBody,
      opts.signatureHeader,
      opts.webhookSecret,
    );
  } catch (err) {
    if (err instanceof StripeSignatureError) {
      return { status: "signature_invalid", message: err.message };
    }
    throw err;
  }
  const isNew = await opts.store.markProcessed(event.id);
  if (!isNew) {
    return { status: "ok", eventId: event.id, duplicate: true };
  }
  try {
    await opts.registry.dispatch(event);
  } catch (error) {
    return { status: "handler_error", eventId: event.id, error };
  }
  return { status: "ok", eventId: event.id, duplicate: false };
}
