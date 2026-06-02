/**
 * @usetheo/plugin-openapi options — Zod single source of truth.
 *
 * Per P#3 plan v1.3 T2.2 + type-safety.md.
 *
 * Includes 3 absorbed edge-case refines:
 *  - v1.1 path-traversal: openapiSourcePath MUST NOT contain ".."
 *  - v1.3 EC-4 path-collision: docsPath !== openapiJsonPath
 *  - v1.3 EC-5 https-only: cdnUrl MUST use https:// (mixed-content defense)
 *
 * Strict mode rejects unknown keys (typo defense per Zod best-practice).
 */
import { z } from 'zod'

export const openApiOptionsSchema = z
  .object({
    /** Path where the docs HTML is served. Default '/api/docs'. */
    docsPath: z.string().regex(/^\//, 'docsPath must start with "/"').default('/api/docs'),
    /** Path where the openapi.json is served. Default '/api/docs/openapi.json'. */
    openapiJsonPath: z
      .string()
      .regex(/^\//, 'openapiJsonPath must start with "/"')
      .default('/api/docs/openapi.json'),
    /**
     * Disk path (relative to cwd) where theokit emits openapi.json.
     * Default '.theo/openapi.json'.
     *
     * v1.1 path-traversal refine: ".." segments rejected.
     */
    openapiSourcePath: z
      .string()
      .refine(
        (p) => !p.includes('..'),
        'openapiSourcePath must not contain ".." (path traversal defense)',
      )
      .default('.theo/openapi.json'),
    /**
     * CDN URL for the Scalar bundle. Default jsdelivr.
     *
     * v1.3 EC-5 https-only refine: avoids browser mixed-content blocking.
     */
    cdnUrl: z
      .string()
      .url()
      .refine(
        (url) => url.startsWith('https://'),
        'cdnUrl must use https:// to avoid browser mixed-content blocking',
      )
      .default('https://cdn.jsdelivr.net/npm/@scalar/api-reference'),
    /** HTML page title. Default 'API Reference'. */
    pageTitle: z.string().default('API Reference'),
  })
  .strict() // reject unknown keys (typo defense)
  .refine(
    (opts) => opts.docsPath !== opts.openapiJsonPath,
    {
      message:
        'docsPath and openapiJsonPath must be distinct paths (v1.3 EC-4: collision causes Scalar UI to fetch HTML at the JSON URL, breaking init)',
    },
  )

export type OpenApiOptions = z.input<typeof openApiOptionsSchema>
export type ValidatedOpenApiOptions = z.output<typeof openApiOptionsSchema>

export class OpenApiPluginConfigError extends Error {
  public override readonly cause?: unknown
  constructor(message: string, cause?: unknown) {
    super(message)
    this.name = 'OpenApiPluginConfigError'
    this.cause = cause
  }
}

export function validateOpenApiOptions(opts: OpenApiOptions = {}): ValidatedOpenApiOptions {
  const result = openApiOptionsSchema.safeParse(opts)
  if (!result.success) {
    const summary = result.error.issues
      .map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`)
      .join('; ')
    throw new OpenApiPluginConfigError(
      `Invalid @usetheo/plugin-openapi options: ${summary}`,
      result.error,
    )
  }
  return result.data
}
