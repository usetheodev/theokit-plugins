/**
 * @theokit/plugin-payments — idempotency store.
 *
 * Per plan p6-plugin-payments v1.0 § Phase 2 / T2.3.
 * Blueprint ADR D2: canonical Next.js example DOES NOT implement idempotency
 * (gap); Stripe retries failed webhooks ~3 days → real double-processing risk.
 *
 * Plugin ships:
 *   - `IdempotencyStore` interface (consumer-implementable)
 *   - `createMemoryStore()` — dev/test default (single-process; not multi-replica safe)
 *   - `createOrmStore(repo)` — production-grade via @theokit/orm Repository
 *     (atomic UNIQUE event_id INSERT detects duplicates)
 */

/**
 * Contract for idempotency storage. Consumer apps may provide their own
 * implementation backed by Redis, Postgres advisory locks, etc.
 */
export interface IdempotencyStore {
  /**
   * Atomic claim: mark a Stripe webhook event as processed.
   *
   * @returns `true` if the event was new (consumer should process it);
   *          `false` if the event was already processed (consumer should
   *          return 200 without re-running the handler).
   */
  markProcessed(eventId: string): Promise<boolean>;
}

/**
 * In-memory idempotency store. Suitable for dev and tests; NOT multi-replica
 * safe (each process has its own Set; in a multi-process deploy, the same
 * event may slip past as new on a different replica).
 *
 * Uses an internal single-flight Promise map so concurrent calls for the
 * same event ID resolve consistently — exactly one returns `true`.
 */
export function createMemoryStore(): IdempotencyStore {
  const seen = new Set<string>();
  // In-flight claims per event ID so concurrent callers race deterministically.
  const inflight = new Map<string, Promise<boolean>>();

  return {
    async markProcessed(eventId: string): Promise<boolean> {
      const existing = inflight.get(eventId);
      if (existing) {
        // Wait for the in-flight call; we lost the race → always false here.
        await existing;
        return false;
      }
      const promise: Promise<boolean> = (async () => {
        if (seen.has(eventId)) return false;
        seen.add(eventId);
        return true;
      })();
      inflight.set(eventId, promise);
      try {
        return await promise;
      } finally {
        inflight.delete(eventId);
      }
    },
  };
}

/**
 * Minimal Repository surface needed by `createOrmStore`. Structural so the
 * plugin doesn't take a peerDep on a specific @theokit/orm version's exported
 * Repository<T> generic.
 *
 * Consumer provides an object that wraps a drizzle Repository configured for
 * the `webhook_events` table with `event_id` UNIQUE.
 */
export interface IdempotencyRepository {
  /**
   * Attempt to insert a new webhook event row. Returns `true` if inserted;
   * `false` if the event_id already exists (UNIQUE constraint violation
   * caught at adapter level).
   */
  insertNew(eventId: string): Promise<boolean>;
}

/**
 * Production-grade idempotency store backed by an @theokit/orm Repository.
 *
 * Schema recommendation for consumers (see README for migration SQL):
 *
 * ```sql
 * CREATE TABLE webhook_events (
 *   event_id TEXT PRIMARY KEY,
 *   processed_at TIMESTAMP NOT NULL DEFAULT NOW()
 * );
 * ```
 *
 * The atomic INSERT + UNIQUE constraint guarantees no double-processing
 * across multiple replicas (the DB is the source of truth).
 */
export function createOrmStore(repo: IdempotencyRepository): IdempotencyStore {
  return {
    async markProcessed(eventId: string): Promise<boolean> {
      return await repo.insertNew(eventId);
    },
  };
}
