/**
 * @theokit/auth-magic-link — built-in MagicLinkStore adapters.
 *
 * Per plan G11 ADR D7 (pluggable storage):
 *   - createMemoryStore: dev/test only — single-process, lost on restart.
 *     Atomic via single-threaded JS event loop + Map operations.
 *   - createOrmStore: production — pluggable Repository<MagicLinkRow> (any
 *     ORM that satisfies the minimal Repository interface). Atomicity via
 *     UPDATE...RETURNING (Postgres/MySQL/SQLite) — implementation detail
 *     lives in the Repository contract, NOT here.
 */

import type { MagicLinkStore, MagicLinkTokenRecord } from "./types.js";

interface MemoryEntry {
  email: string;
  expiresAt: Date;
}

export function createMemoryStore(): MagicLinkStore {
  const tokens = new Map<string, MemoryEntry>();

  return {
    async createToken({ email, token, expiresAt }) {
      tokens.set(token, { email, expiresAt });
    },
    async consumeToken({ token }) {
      // EC-11 atomicity: read + delete in a single sync turn — JS event loop
      // guarantees no interleave between two concurrent consumeToken calls
      // on the in-memory adapter.
      const entry = tokens.get(token);
      if (!entry) return null;
      tokens.delete(token);
      if (entry.expiresAt.getTime() <= Date.now()) return null;
      const record: MagicLinkTokenRecord = { email: entry.email, expiresAt: entry.expiresAt };
      return record;
    },
    async revokeToken({ token }) {
      tokens.delete(token);
    },
    async cleanupExpired() {
      const now = Date.now();
      let removed = 0;
      for (const [token, entry] of tokens) {
        if (entry.expiresAt.getTime() <= now) {
          tokens.delete(token);
          removed += 1;
        }
      }
      return removed;
    },
  };
}

/**
 * Minimal Repository interface that a @theokit/orm Repository satisfies.
 * Apps using @theokit/orm pass `orm.getRepository(MagicLinkRow)` directly.
 * The store does NOT depend on @theokit/orm at type level — any adapter
 * satisfying this surface works (Drizzle, Prisma, hand-rolled SQL).
 */
export interface MagicLinkRepository {
  insert(row: { token: string; email: string; expiresAt: Date; consumedAt: Date | null }): Promise<void>;
  /**
   * Atomically mark the token consumed and return the row. MUST be a single
   * SQL UPDATE...RETURNING (or equivalent) so concurrent callers race on
   * the row lock and only one observes consumedAt === null.
   */
  consumeAtomically(token: string, now: Date): Promise<{ email: string; expiresAt: Date } | null>;
  delete(token: string): Promise<void>;
  deleteExpired(now: Date): Promise<number>;
}

export function createOrmStore(repo: MagicLinkRepository): MagicLinkStore {
  return {
    async createToken({ email, token, expiresAt }) {
      await repo.insert({ token, email, expiresAt, consumedAt: null });
    },
    async consumeToken({ token }) {
      const row = await repo.consumeAtomically(token, new Date());
      if (!row) return null;
      if (row.expiresAt.getTime() <= Date.now()) return null;
      return { email: row.email, expiresAt: row.expiresAt };
    },
    async revokeToken({ token }) {
      await repo.delete(token);
    },
    async cleanupExpired() {
      return repo.deleteExpired(new Date());
    },
  };
}
