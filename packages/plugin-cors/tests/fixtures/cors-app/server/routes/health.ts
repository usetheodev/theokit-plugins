/**
 * Fixture (T3.1) — simple health endpoint exercised by the fixture's
 * CORS request lifecycle.
 */
import { defineRoute } from 'theokit/server'

// Method is inferred from filename convention in TheoKit's file-router.
// `health.ts` defaults to GET.
export default defineRoute({
  handler: () => Response.json({ status: 'ok' }),
})
