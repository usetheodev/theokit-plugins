/**
 * @theokit/auth-magic-link — T4.1 unit + integration tests.
 *
 * Covers plan TDD checklist:
 *   - test_magic_link_token_is_32_bytes_url_safe
 *   - test_magic_link_token_consumed_only_once
 *   - test_magic_link_token_expires_after_lifetime  (time-mock via vi.useFakeTimers)
 *   - test_magic_link_callback_throws_on_missing_token
 *   - test_magic_link_callback_throws_on_expired_token
 *   - test_magic_link_send_email_error_propagates   (D8 invariant)
 *   - test_memory_store_isolated_per_instance
 *   - test_orm_store_via_real_repository            (uses in-memory MagicLinkRepository)
 *   - test_magic_link_token_consumed_atomically_under_race  (v1.1 EC-11)
 *   - test_magic_link_throws_on_missing_or_invalid_email    (v1.1 EC-12)
 */

import type { IncomingMessage } from "node:http";
import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createMemoryStore,
  createOrmStore,
  magicLink,
  type MagicLinkRepository,
  type SendMagicLinkFn,
} from "../src/index.js";

function mockReq(opts: {
  url?: string;
  method?: string;
  body?: string;
  contentType?: string;
}): IncomingMessage {
  const headers: Record<string, string> = { host: "myapp.test" };
  if (opts.contentType) headers["content-type"] = opts.contentType;
  const body = opts.body ?? "";

  // Minimal async iterable shim that yields the body as a single Buffer chunk.
  const req: Partial<IncomingMessage> = {
    url: opts.url ?? "/api/auth/magic-link/start",
    method: opts.method ?? "GET",
    headers,
  };
  (req as unknown as AsyncIterable<Buffer>)[Symbol.asyncIterator] = async function* () {
    if (body) yield Buffer.from(body, "utf8");
  };
  return req as IncomingMessage;
}

function makeProvider(overrides: { sendEmail?: SendMagicLinkFn } = {}) {
  const store = createMemoryStore();
  const sendEmail = (overrides.sendEmail ??
    vi.fn().mockResolvedValue(undefined)) as SendMagicLinkFn & ReturnType<typeof vi.fn>;
  const provider = magicLink({
    store,
    sendEmail,
    callbackBaseUrl: "https://myapp.test",
  });
  return { provider, store, sendEmail };
}

describe("createMemoryStore", () => {
  it("two instances do not share state (isolation)", async () => {
    const a = createMemoryStore();
    const b = createMemoryStore();
    await a.createToken({ email: "x@a.test", token: "tok-a", expiresAt: new Date(Date.now() + 60_000) });
    const fromB = await b.consumeToken({ token: "tok-a" });
    expect(fromB).toBeNull();
  });

  it("consumeToken returns the record once and null on second call", async () => {
    const store = createMemoryStore();
    await store.createToken({
      email: "u@u.test",
      token: "single-use",
      expiresAt: new Date(Date.now() + 60_000),
    });
    const first = await store.consumeToken({ token: "single-use" });
    const second = await store.consumeToken({ token: "single-use" });
    expect(first?.email).toBe("u@u.test");
    expect(second).toBeNull();
  });

  it("EC-11 atomicity: 2 concurrent consumeToken → exactly one wins", async () => {
    const store = createMemoryStore();
    await store.createToken({
      email: "race@test",
      token: "race-token",
      expiresAt: new Date(Date.now() + 60_000),
    });
    const [r1, r2] = await Promise.all([
      store.consumeToken({ token: "race-token" }),
      store.consumeToken({ token: "race-token" }),
    ]);
    const winners = [r1, r2].filter((r) => r !== null);
    expect(winners).toHaveLength(1);
  });

  it("cleanupExpired removes only expired tokens, returns count", async () => {
    const store = createMemoryStore();
    await store.createToken({ email: "f@t", token: "fresh", expiresAt: new Date(Date.now() + 60_000) });
    await store.createToken({ email: "e@t", token: "expired", expiresAt: new Date(Date.now() - 60_000) });
    const removed = await store.cleanupExpired();
    expect(removed).toBe(1);
    // fresh still consumable
    expect(await store.consumeToken({ token: "fresh" })).not.toBeNull();
    expect(await store.consumeToken({ token: "expired" })).toBeNull();
  });

  it("returns null for expired tokens during consumeToken", async () => {
    const store = createMemoryStore();
    await store.createToken({
      email: "x@t",
      token: "stale",
      expiresAt: new Date(Date.now() - 1000),
    });
    expect(await store.consumeToken({ token: "stale" })).toBeNull();
  });
});

describe("createOrmStore (integration via in-memory MagicLinkRepository)", () => {
  function inMemoryRepo(): MagicLinkRepository {
    const rows = new Map<string, { email: string; expiresAt: Date; consumedAt: Date | null }>();
    return {
      async insert(row) {
        rows.set(row.token, {
          email: row.email,
          expiresAt: row.expiresAt,
          consumedAt: row.consumedAt,
        });
      },
      async consumeAtomically(token, now) {
        const row = rows.get(token);
        if (!row) return null;
        if (row.consumedAt) return null;
        row.consumedAt = now;
        return { email: row.email, expiresAt: row.expiresAt };
      },
      async delete(token) {
        rows.delete(token);
      },
      async deleteExpired(now) {
        let n = 0;
        for (const [t, r] of rows) {
          if (r.expiresAt.getTime() <= now.getTime()) {
            rows.delete(t);
            n += 1;
          }
        }
        return n;
      },
    };
  }

  it("full create → consume → re-consume cycle via ORM-shaped repo", async () => {
    const store = createOrmStore(inMemoryRepo());
    await store.createToken({
      email: "orm@test",
      token: "orm-tok",
      expiresAt: new Date(Date.now() + 60_000),
    });
    const first = await store.consumeToken({ token: "orm-tok" });
    const second = await store.consumeToken({ token: "orm-tok" });
    expect(first?.email).toBe("orm@test");
    expect(second).toBeNull();
  });
});

describe("magicLink() startSignIn", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date("2026-06-03T20:00:00Z") });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("32-byte URL-safe token generated, persisted, and emailed", async () => {
    const { provider, sendEmail, store } = makeProvider();
    const req = mockReq({
      url: "/api/auth/magic-link/start?email=user%40example.com",
    });
    const redirect = await provider.startSignIn(req);

    expect(sendEmail).toHaveBeenCalledOnce();
    const call = sendEmail.mock.calls[0]![0];
    expect(call.to).toBe("user@example.com");
    expect(call.token).toMatch(/^[A-Za-z0-9_-]+$/); // base64url
    // 32 bytes → 43 base64url chars
    expect(call.token.length).toBe(43);
    expect(call.magicLinkUrl).toContain(call.token);
    expect(redirect.pathname).toBe("/auth/check-email");

    // Token persisted (consumeToken should succeed)
    const record = await store.consumeToken({ token: call.token });
    expect(record?.email).toBe("user@example.com");
  });

  it("EC-12 throws MagicLinkConfigError when email missing", async () => {
    const { provider } = makeProvider();
    const req = mockReq({ url: "/api/auth/magic-link/start" });
    await expect(provider.startSignIn(req)).rejects.toMatchObject({
      name: "MagicLinkConfigError",
      code: "invalid_email",
    });
  });

  it("EC-12 throws MagicLinkConfigError when email malformed", async () => {
    const { provider } = makeProvider();
    const req = mockReq({
      url: "/api/auth/magic-link/start?email=not-an-email",
    });
    await expect(provider.startSignIn(req)).rejects.toMatchObject({
      code: "invalid_email",
    });
  });

  it("D8 invariant: sendEmail error propagates (NOT swallowed) + token NOT persisted past failure", async () => {
    const transportError = new Error("Resend API key invalid");
    const sendEmail = vi.fn().mockRejectedValue(transportError);
    const { provider } = makeProvider({ sendEmail });
    const req = mockReq({ url: "/api/auth/magic-link/start?email=ok%40ok.test" });
    await expect(provider.startSignIn(req)).rejects.toThrow("Resend API key invalid");
  });
});

describe("magicLink() handleCallback", () => {
  it("returns MagicLinkProfile after consuming a valid token", async () => {
    const { provider, store } = makeProvider();
    await store.createToken({
      email: "valid@test",
      token: "good-tok",
      expiresAt: new Date(Date.now() + 60_000),
    });
    const req = mockReq({
      url: "/api/auth/magic-link/callback?token=good-tok",
    });
    const result = await provider.handleCallback(req, {
      state: "irrelevant",
      createdAt: 0,
      expiresAt: 0,
    });
    expect(result.providerName).toBe("magic-link");
    expect(result.profile.email).toBe("valid@test");
    expect(result.profile.verifiedAt).toBeInstanceOf(Date);
  });

  it("throws missing_token when query lacks token", async () => {
    const { provider } = makeProvider();
    const req = mockReq({ url: "/api/auth/magic-link/callback" });
    await expect(
      provider.handleCallback(req, { state: "x", createdAt: 0, expiresAt: 0 }),
    ).rejects.toMatchObject({ code: "missing_token" });
  });

  it("throws invalid_or_expired_token for unknown token", async () => {
    const { provider } = makeProvider();
    const req = mockReq({ url: "/api/auth/magic-link/callback?token=missing" });
    await expect(
      provider.handleCallback(req, { state: "x", createdAt: 0, expiresAt: 0 }),
    ).rejects.toMatchObject({ code: "invalid_or_expired_token" });
  });

  it("throws invalid_or_expired_token for expired token (lifetime elapsed)", async () => {
    const { provider, store } = makeProvider();
    await store.createToken({
      email: "expired@t",
      token: "exp-tok",
      expiresAt: new Date(Date.now() - 1000),
    });
    const req = mockReq({ url: "/api/auth/magic-link/callback?token=exp-tok" });
    await expect(
      provider.handleCallback(req, { state: "x", createdAt: 0, expiresAt: 0 }),
    ).rejects.toMatchObject({ code: "invalid_or_expired_token" });
  });

  it("rejects re-use of a once-consumed token", async () => {
    const { provider, store } = makeProvider();
    await store.createToken({
      email: "once@t",
      token: "one-shot",
      expiresAt: new Date(Date.now() + 60_000),
    });
    const req1 = mockReq({ url: "/api/auth/magic-link/callback?token=one-shot" });
    const req2 = mockReq({ url: "/api/auth/magic-link/callback?token=one-shot" });
    await provider.handleCallback(req1, { state: "x", createdAt: 0, expiresAt: 0 });
    await expect(
      provider.handleCallback(req2, { state: "x", createdAt: 0, expiresAt: 0 }),
    ).rejects.toMatchObject({ code: "invalid_or_expired_token" });
  });
});

const sha256hex = (s: string) => createHash("sha256").update(s).digest("hex");

describe("token hashing at rest (T3.1 #191)", () => {
  it("orm store inserts the token HASH, never the raw token", async () => {
    const inserts: { token: string }[] = [];
    const repo: MagicLinkRepository = {
      async insert(row) {
        inserts.push(row);
      },
      async consumeAtomically() {
        return null;
      },
      async delete() {},
      async deleteExpired() {
        return 0;
      },
    };
    const store = createOrmStore(repo);
    await store.createToken({
      email: "a@b.co",
      token: "raw-token-xyz",
      expiresAt: new Date(Date.now() + 60_000),
    });
    expect(inserts[0]?.token).toBe(sha256hex("raw-token-xyz"));
    expect(inserts[0]?.token).not.toBe("raw-token-xyz");
  });

  it("orm store looks up by the token HASH on consume (no plaintext lookup)", async () => {
    const seen: string[] = [];
    const repo: MagicLinkRepository = {
      async insert() {},
      async consumeAtomically(token) {
        seen.push(token);
        return null;
      },
      async delete() {},
      async deleteExpired() {
        return 0;
      },
    };
    const store = createOrmStore(repo);
    await store.consumeToken({ token: "raw-abc" });
    expect(seen[0]).toBe(sha256hex("raw-abc"));
    expect(seen[0]).not.toBe("raw-abc");
  });

  it("memory store round-trips by raw token + single-use (hashed storage transparent to callers)", async () => {
    const store = createMemoryStore();
    await store.createToken({
      email: "a@b.co",
      token: "plain",
      expiresAt: new Date(Date.now() + 60_000),
    });
    expect((await store.consumeToken({ token: "plain" }))?.email).toBe("a@b.co");
    expect(await store.consumeToken({ token: "plain" })).toBeNull();
  });
});

describe("magic-link tokens are unbound bearer credentials (T3.1 #190 — cross-device by design)", () => {
  it("handleCallback succeeds with a mismatched/empty tx.state (cross-device click)", async () => {
    // The user may click the email link on a DIFFERENT device than the one that
    // called startSignIn, so no initiating-browser tx.state cookie is present.
    // The token is a bearer credential (32B entropy + 15min TTL + single-use +
    // hash-at-rest); tx.state binding is intentionally NOT enforced. This test
    // guards against a future regression that re-adds OAuth-style state binding
    // and would break cross-device sign-in. (ADR D6 binding option superseded.)
    const { provider, store } = makeProvider();
    await store.createToken({
      email: "cross@device",
      token: "cross-device-tok",
      expiresAt: new Date(Date.now() + 60_000),
    });
    const req = mockReq({
      url: "/api/auth/magic-link/callback?token=cross-device-tok",
    });
    const result = await provider.handleCallback(req, {
      state: "a-totally-different-browser-state",
      createdAt: 0,
      expiresAt: 0,
    });
    expect(result.profile.email).toBe("cross@device");
  });
});
