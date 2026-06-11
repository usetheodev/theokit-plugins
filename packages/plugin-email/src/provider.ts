/**
 * @theokit/plugin-email — provider extension helper.
 *
 * Per plan p7-plugin-email v1.0 § Phase 1 / T1.2.
 * Blueprint ADR D1 — interface-based abstraction.
 */

import type { EmailProvider } from "./types.js";

/**
 * Helper for consumer-custom email providers. Pass-through that exists for
 * documentation symmetry with the canonical `ResendProvider` factory.
 *
 * ```ts
 * import { defineEmailProvider, type EmailMessage, type SendResult } from "@theokit/plugin-email";
 *
 * const consoleProvider = defineEmailProvider({
 *   name: "console",
 *   async send(msg: EmailMessage): Promise<SendResult> {
 *     console.log("[email]", msg.subject, "→", msg.to);
 *     return { id: `console_${Date.now()}`, provider: "console" };
 *   },
 * });
 * ```
 */
export function defineEmailProvider(impl: EmailProvider): EmailProvider {
  return impl;
}
