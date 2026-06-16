# BLOCKED — T2.2 (#167 webhook mark-after-success) — 2026-06-16

**Status:** BLOCKED (halt-loop did NOT emit IMPLEMENTATION_COMPLETE). Downstream `/review` and `/release` MUST NOT run until resolved.

## The blocker

Task T2.2 (plan: "mark webhook event processed only AFTER successful dispatch", ADR D4) cannot, within its declared scope (`webhook.ts` + `webhook.test.ts` only), simultaneously satisfy all three correctness requirements, because `IdempotencyStore` exposes only one atomic primitive — `markProcessed(eventId): Promise<boolean>` (claim+mark) — with **no `release`/`unmark`**.

| Design (webhook.ts only) | #167 failed handler → retried | Existing dedup test (webhook.test.ts:274, `invocations === 1` across 2 deliveries of a SUCCESSFUL event) | concurrent same-event |
|---|---|---|---|
| Claim-before (current) | ✗ (the bug) | ✓ | ✓ |
| Mark-after-success (D4) | ✓ | ✗ — handler re-runs on EVERY redelivery (no pre-check possible without a non-marking read) | ✗ double-dispatch |
| Claim + release-on-failure | ✓ | ✓ | ✓ | ← requires `IdempotencyStore.release()` |

Mark-after-success (the plan's chosen design) defeats the idempotency store's core purpose for the success path: Stripe legitimately redelivers events (at-least-once), and under mark-after-success a redelivered *successful* event re-dispatches the handler every time (the dedup only dedupes the *result*, not the handler execution). That is a material weakening of the idempotency guarantee, and it breaks the existing `invocations === 1` contract (webhook.test.ts:274).

The only design that fixes #167 AND preserves handler-level dedup AND is concurrency-safe is **claim-before + release-on-failure**, which requires extending the public `IdempotencyStore` interface with a `release(eventId)` method — and `idempotency-store.ts` is **T2.4's file**, plus it is a public-API change (consumers implement this interface).

SEPA (pre-RED, this iteration) recommended design (A) believing webhook.test.ts:274 would stay green; verification shows it does not — under mark-after-success the handler re-runs before the post-dispatch mark check.

## Why HALT instead of forcing it

- Forcing (A) means weakening/rewriting an existing passing test (`invocations === 1` → at-least-once) AND silently downgrading the idempotency guarantee — a money/correctness contract change that should be an explicit, owner-approved decision, not an implementer's unilateral call.
- Implementing the correct claim+release design means a **public-interface change** to `IdempotencyStore` (T2.4's file) with its own changeset — cross-task scope expansion the plan did not budget for T2.2.
- Per Unbreakable Rule 3 (honest BLOCKED > false PASS) and cycle-implement § Stop conditions #3.

## Recommended resolutions (owner decides — loop back to cycle-plan)

1. **Merge the store fix into this work (recommended):** extend `IdempotencyStore` with `release(eventId): Promise<void>` (or rename the model to a two-phase `claim`/`commit`/`release`), implement it in `createMemoryStore` + `createOrmStore`, and have `processWebhook` claim-before → dispatch → commit-on-success / release-on-failure. True exactly-once + retry. Requires a `@theokit/plugin-payments` changeset (public interface gains a method) and re-scoping T2.2 to include `idempotency-store.ts` (effectively merging T2.2 + part of T2.4).
2. **Accept the weaker contract explicitly:** keep mark-after-success, update webhook.test.ts:274 to assert at-least-once + result-dedup, and document in ADR D4 + `defineStripeWebhook` JSDoc that handlers MUST be idempotent because every redelivery re-runs them. Cheapest, but a real downgrade of the idempotency guarantee.

## State

- T2.1 (#199/#200 currency) committed `b074718` — unaffected.
- T2.2 marked `blocked` in `.progress-remediate-code-review-2026-06-16.json`.
- No code changes staged for T2.2; working tree clean apart from this report + progress.
