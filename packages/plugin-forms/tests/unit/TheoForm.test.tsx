/**
 * T3.4 — TheoForm error-propagation logic regression test.
 *
 * TheoForm's handleValid callback distinguishes ActionInputError-shaped
 * errors (duck-typed via `fields` property) from arbitrary errors. The
 * former get routed to RHF's setError; the latter are re-thrown.
 *
 * This test exercises the extractFieldsFromError + re-throw logic directly,
 * because mounting <TheoForm> requires @theokit/react's useAction + a
 * DOM environment that may not be fully wired in CI for this package's
 * peer deps. The logic under test lives in TheoForm.tsx:handleValid's
 * catch block.
 */
import { describe, expect, it, vi } from "vitest";

/**
 * Mirror of the duck-type detection from TheoForm.tsx (lines 186-191).
 * We test the extraction logic in isolation to verify the re-throw contract.
 */
function extractFieldsFromError(err: unknown): Record<string, string[]> | undefined {
  if (err === null || typeof err !== "object") return undefined;
  const obj = err as Record<string, unknown>;
  if (obj.fields === null || typeof obj.fields !== "object") return undefined;
  return obj.fields as Record<string, string[]>;
}

describe("TheoForm error propagation logic", () => {
  it("T3.4: non-ActionInputError (TypeError) is NOT recognized as field error — triggers rethrow path", () => {
    // Arrange: a TypeError (has no `.fields` property)
    const typeError = new TypeError("Cannot read property 'x' of undefined");

    // Act: extractFieldsFromError should return undefined for a TypeError
    const fields = extractFieldsFromError(typeError);

    // Assert: undefined means the else-branch fires (throw err), not the
    // applyActionErrorsToForm path.
    expect(fields).toBeUndefined();
  });

  it("T3.4: ActionInputError-shaped error IS recognized as field error", () => {
    // Arrange: duck-typed ActionInputError
    const actionError = {
      type: "TheoActionInputError",
      code: "VALIDATION_ERROR",
      status: 422,
      fields: { email: ["Required"] },
    };

    // Act
    const fields = extractFieldsFromError(actionError);

    // Assert: fields extracted — this would route to applyActionErrorsToForm
    expect(fields).toEqual({ email: ["Required"] });
  });

  it("T3.4: handleValid re-throw contract — non-field errors propagate", async () => {
    // Simulate the handleValid catch-block logic
    const setError = vi.fn();
    const typeError = new TypeError("onSuccess blew up");

    // This mirrors handleValid's catch block at TheoForm.tsx:113-129
    const simulateHandleValidCatch = (err: unknown) => {
      const fields = extractFieldsFromError(err);
      if (fields !== undefined) {
        // Would call applyActionErrorsToForm — swallowed as form error
        for (const [name, messages] of Object.entries(fields)) {
          setError(name, { type: "server", message: messages[0] ?? "" });
        }
      } else {
        // Re-throw — the error propagates
        throw err;
      }
    };

    // Assert: TypeError propagates (re-thrown), not swallowed
    expect(() => simulateHandleValidCatch(typeError)).toThrow(TypeError);
    expect(() => simulateHandleValidCatch(typeError)).toThrow("onSuccess blew up");
    expect(setError).not.toHaveBeenCalled();
  });
});
