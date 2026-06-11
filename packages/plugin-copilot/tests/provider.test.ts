import { describe, expect, it } from "vitest";
import { defineCopilotRealtimeProvider } from "../src/provider.js";
import type { CopilotRealtimeProvider } from "../src/types.js";

const stub: CopilotRealtimeProvider = {
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

describe("defineCopilotRealtimeProvider", () => {
  it("returns identity unchanged for valid impl", () => {
    expect(defineCopilotRealtimeProvider(stub)).toBe(stub);
  });

  it("throws when method missing", () => {
    expect(() =>
      defineCopilotRealtimeProvider({
        ...stub,
        // @ts-expect-error runtime guard
        joinRoom: undefined,
      }),
    ).toThrow(TypeError);
  });

  it("throws when impl is null", () => {
    expect(() =>
      // @ts-expect-error runtime guard
      defineCopilotRealtimeProvider(null),
    ).toThrow(TypeError);
  });
});
