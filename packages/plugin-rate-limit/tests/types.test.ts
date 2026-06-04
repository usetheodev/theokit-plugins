import { describe, expect, it } from "vitest";
import {
  RateLimitConfigError,
  RateLimitError,
  RateLimitProviderError,
} from "../src/types.js";

describe("RateLimitError hierarchy", () => {
  it("RateLimitError carries optional code", () => {
    const e = new RateLimitError("boom", { code: "test_code" });
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe("RateLimitError");
    expect(e.code).toBe("test_code");
  });

  it("RateLimitError defaults code undefined", () => {
    expect(new RateLimitError("plain").code).toBeUndefined();
  });

  it("RateLimitProviderError defaults code 'provider_failure'", () => {
    const e = new RateLimitProviderError("redis down");
    expect(e).toBeInstanceOf(RateLimitError);
    expect(e.name).toBe("RateLimitProviderError");
    expect(e.code).toBe("provider_failure");
  });

  it("RateLimitProviderError accepts custom code", () => {
    const e = new RateLimitProviderError("eval fail", { code: "redis_eval_failed" });
    expect(e.code).toBe("redis_eval_failed");
  });

  it("RateLimitConfigError defaults code 'config_invalid'", () => {
    const e = new RateLimitConfigError("missing keyPrefix");
    expect(e).toBeInstanceOf(RateLimitError);
    expect(e.name).toBe("RateLimitConfigError");
    expect(e.code).toBe("config_invalid");
  });

  it("RateLimitError propagates cause", () => {
    const cause = new Error("upstream");
    const e = new RateLimitError("wrapped", { cause });
    expect(e.cause).toBe(cause);
  });
});
