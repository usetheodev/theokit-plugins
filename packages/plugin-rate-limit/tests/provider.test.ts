import { describe, expect, it } from "vitest";
import { defineRateLimitProvider } from "../src/provider.js";
import type { RateLimitProvider } from "../src/types.js";

const stub: RateLimitProvider = {
  name: "stub",
  async limit() {
    return { success: true, limit: 1, remaining: 0, resetAt: 0 };
  },
  async get() {
    return { success: true, limit: 1, remaining: 0, resetAt: 0 };
  },
  async delete() {},
  async block() {},
};

describe("defineRateLimitProvider", () => {
  it("returns the provider identity unchanged", () => {
    const r = defineRateLimitProvider(stub);
    expect(r).toBe(stub);
  });

  it("throws on missing name", () => {
    expect(() => defineRateLimitProvider({ ...stub, name: "" })).toThrow(TypeError);
  });

  it("throws on missing method", () => {
    expect(() =>
      defineRateLimitProvider({
        ...stub,
        // @ts-expect-error runtime guard
        limit: undefined,
      }),
    ).toThrow(TypeError);
  });
});
