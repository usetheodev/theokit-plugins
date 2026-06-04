import { describe, expect, it } from "vitest";
import { fixedWindow, slidingWindow, tokenBucket } from "../src/algorithms.js";

describe("algorithm factories", () => {
  it("slidingWindow returns discriminated config", () => {
    const cfg = slidingWindow(60, 60_000);
    expect(cfg).toEqual({ kind: "slidingWindow", tokens: 60, windowMs: 60_000 });
  });

  it("tokenBucket returns discriminated config", () => {
    const cfg = tokenBucket(10, 100);
    expect(cfg).toEqual({ kind: "tokenBucket", refillRate: 10, capacity: 100 });
  });

  it("fixedWindow returns discriminated config", () => {
    const cfg = fixedWindow(30, 30_000);
    expect(cfg).toEqual({ kind: "fixedWindow", tokens: 30, windowMs: 30_000 });
  });

  it("slidingWindow rejects non-positive tokens", () => {
    expect(() => slidingWindow(0, 60_000)).toThrow(TypeError);
    expect(() => slidingWindow(-1, 60_000)).toThrow(TypeError);
  });

  it("slidingWindow rejects non-positive window", () => {
    expect(() => slidingWindow(60, 0)).toThrow(TypeError);
  });

  it("tokenBucket rejects non-positive rate", () => {
    expect(() => tokenBucket(0, 100)).toThrow(TypeError);
    expect(() => tokenBucket(-1, 100)).toThrow(TypeError);
  });

  it("tokenBucket rejects non-integer capacity", () => {
    expect(() => tokenBucket(10, 1.5)).toThrow(TypeError);
  });

  it("fixedWindow rejects non-positive tokens + window", () => {
    expect(() => fixedWindow(0, 1000)).toThrow(TypeError);
    expect(() => fixedWindow(10, 0)).toThrow(TypeError);
  });
});
