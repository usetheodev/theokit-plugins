import { describe, expect, it } from "vitest";
import { defineRealtimeProvider } from "../src/provider.js";
import type { RealtimeProvider } from "../src/types.js";

const stubProvider: RealtimeProvider = {
  name: "stub",
  async joinRoom() {},
  async leaveRoom() {},
  async broadcast() {},
  async updatePresence() {},
  async getPresence() {
    return {};
  },
  subscribeRoom() {
    return () => {};
  },
};

describe("defineRealtimeProvider", () => {
  it("returns the provider identity unchanged", () => {
    const result = defineRealtimeProvider(stubProvider);
    expect(result).toBe(stubProvider);
    expect(result.name).toBe("stub");
  });

  it("throws on null/undefined impl", () => {
    expect(() =>
      // @ts-expect-error runtime guard
      defineRealtimeProvider(null),
    ).toThrow(TypeError);
  });

  it("throws when name missing", () => {
    expect(() =>
      defineRealtimeProvider({ ...stubProvider, name: "" }),
    ).toThrow(TypeError);
  });

  it("throws when required method missing", () => {
    expect(() =>
      defineRealtimeProvider({
        ...stubProvider,
        // @ts-expect-error runtime guard
        joinRoom: undefined,
      }),
    ).toThrow(TypeError);
  });
});
