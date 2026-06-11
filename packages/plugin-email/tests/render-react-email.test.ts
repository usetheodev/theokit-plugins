/**
 * RED tests for P#7 T2.2 — renderReactEmail dynamic-import bridge.
 */
import { describe, expect, it } from "vitest";

import { renderReactEmail } from "../src/render-react-email.js";

describe("renderReactEmail (P#7 T2.2)", () => {
  it("function is exported and callable", () => {
    expect(typeof renderReactEmail).toBe("function");
  });

  it("throws actionable error when @react-email/render not installed", async () => {
    // The dynamic import in renderReactEmail will fail in this test environment
    // because @react-email/render is not installed in plugin-email's deps.
    // The function should throw with an actionable install instruction.
    await expect(renderReactEmail({})).rejects.toThrow(
      /react-email\/render not installed/,
    );
  });
});
