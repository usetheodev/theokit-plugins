/**
 * CORS options schema + runtime validation.
 *
 * See ADR-D3 (TheoKit core plan) — origin accepts string | string[] | predicate | true.
 * Regex is intentionally rejected (security: overpermissive patterns + CVE history).
 *
 * EC-9 fix: string arrays use `.min(1)` to reject empty-string entries that
 * would produce malformed `Access-Control-Allow-*` headers.
 *
 * W3C invariant enforced at construction time: `origin: '*'` + `credentials: true`
 * is forbidden by spec — browsers reject. Throws actionable error.
 */
import { z } from 'zod'

/**
 * Origin matcher: exact string (or `'*'`), allowlist array, predicate function,
 * or `true` (echo request origin, requires no `credentials` for spec compliance
 * if combined with `'*'`-like behavior).
 */
export const corsOriginSchema = z.union([
  z.literal(true),
  z.string(),
  z.array(z.string().min(1)),
  z
    .function()
    .args(z.string())
    .returns(z.boolean())
    .describe('Origin predicate: (origin: string) => boolean'),
])

const httpMethodSchema = z.string().min(1)

const httpHeaderNameSchema = z.string().min(1)

export const corsOptionsSchema = z
  .object({
    origin: corsOriginSchema.optional(),
    methods: z.array(httpMethodSchema).optional(),
    allowedHeaders: z.array(httpHeaderNameSchema).optional(),
    exposedHeaders: z.array(httpHeaderNameSchema).optional(),
    credentials: z.boolean().optional(),
    maxAge: z.number().int().nonnegative().optional(),
    preflightContinue: z.boolean().optional(),
    optionsSuccessStatus: z.number().int().min(200).max(299).optional(),
  })
  .strict()

export type CorsOptions = z.input<typeof corsOptionsSchema>
export type CorsOptionsResolved = z.output<typeof corsOptionsSchema>

/**
 * Validate + normalize CorsOptions.
 *
 * W3C invariant (caught here at config time, not at first request):
 * `origin: '*'` with `credentials: true` is forbidden by the CORS spec.
 * Browsers reject the response; the user-visible failure mode is broken
 * cross-origin requests with confusing error messages. Throwing at boot
 * gives an actionable error close to the misconfiguration.
 */
export function validateCorsOptions(opts: CorsOptions): CorsOptionsResolved {
  const parsed = corsOptionsSchema.parse(opts)
  if (parsed.origin === '*' && parsed.credentials === true) {
    throw new Error(
      "[@theokit/plugin-cors] Invalid options: `origin: '*'` with `credentials: true` is forbidden by the CORS spec (browsers will reject the response). " +
        'Use a specific origin string, an allowlist array, or `(origin) => true` predicate to echo the request origin.',
    )
  }
  return parsed
}
