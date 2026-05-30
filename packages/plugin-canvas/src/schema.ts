/**
 * Canonical `Artifact` protocol for @usetheo/plugin-canvas.
 *
 * Discriminated union on `kind`. Each variant carries the same envelope
 * (id, sessionId?, title, version, createdAt) plus a kind-specific
 * payload. The envelope is captured by `artifactEnvelopeSchema` so each
 * variant `.extend()`s the same base — there is one shape for storage,
 * one shape for the wire, one shape for the UI prop.
 *
 * Security boundaries baked into the schema (NOT validated downstream
 * by accident):
 *
 *   - `svg` content max 256 KB. A malicious agent can still smuggle
 *     <script> tags into the SVG; the UI renderer sanitises at render
 *     time. Both gates fire (defence in depth — ADR-D2 of the plan).
 *
 *   - `html` srcdoc max 256 KB. `sandbox` is a closed enum so the
 *     consumer cannot escalate by passing arbitrary attributes; if a
 *     deployment needs more isolation, downgrade the value but never
 *     upgrade past `'forms'`.
 *
 *   - `image.source = "url"` requires `https://` (rejects `http://`,
 *     `data:`, `javascript:`, `blob:`). Data URLs go through the
 *     `source = "data"` variant so they parse the MIME prefix.
 *
 *   - `image.source = "data"` accepts `data:image/(png|jpeg|webp|gif|svg+xml);base64,...`
 *     with a 5 MB cap on the base64 length (≈3.75 MB decoded).
 *
 *   - `whiteboard-scene` accepts a free-form JSON object — the
 *     `<Whiteboard>` primitive from `@usetheo/ui/whiteboard` runs its
 *     own Zod gate on top (clamps + finite checks).
 *
 *   - `slide-deck` accepts markdown (string) or a pre-parsed array of
 *     slides; SlideDeck primitive sanitises hast itself.
 *
 *   - `mermaid` accepts the DSL source as a string. Mermaid runtime
 *     runs with `securityLevel: 'strict'`.
 *
 *   - `code` and `markdown` content max 1 MB each (generous; avoids
 *     OOM from a runaway agent).
 *
 * These caps are *boundary defaults* — apps can lower them via the
 * `validateArtifact(opts)` overload.
 */

import { z } from 'zod'

import { CanvasArtifactSecurityError, CanvasArtifactValidationError } from './errors.js'

// ───── Envelope ─────

const isoDateOrEpoch = z.union([z.string().datetime(), z.number().int().nonnegative()])

export const artifactEnvelopeSchema = z.object({
  id: z.string().min(1).max(128),
  sessionId: z.string().min(1).max(128).optional(),
  title: z.string().min(1).max(200),
  version: z.number().int().positive().default(1),
  createdAt: isoDateOrEpoch.default(() => new Date().toISOString()),
})

export type ArtifactEnvelope = z.infer<typeof artifactEnvelopeSchema>

// ───── Per-kind payload schemas ─────

const MAX_CODE_BYTES = 1_048_576 // 1 MB
const MAX_MARKDOWN_BYTES = 1_048_576
const MAX_SVG_BYTES = 262_144 // 256 KB
const MAX_HTML_BYTES = 262_144
const MAX_MERMAID_BYTES = 65_536 // 64 KB — Mermaid dies on huge sources
const MAX_DATA_URL_BYTES = 5_242_880 // 5 MB base64

// Web Standard byte-length: works in browsers, Node, Bun, Deno, edge
// runtimes. `Buffer` is Node-only and crashes in the browser bundle.
const TEXT_ENCODER = /* @__PURE__ */ new TextEncoder()
const byteLength = (s: string): number => TEXT_ENCODER.encode(s).length

const sized = (max: number, fieldName: string) =>
  z.string().refine((s) => byteLength(s) <= max, {
    message: `${fieldName} exceeds the ${Math.floor(max / 1024)} KB cap.`,
  })

const markdownArtifactSchema = artifactEnvelopeSchema.extend({
  kind: z.literal('markdown'),
  content: sized(MAX_MARKDOWN_BYTES, 'markdown content'),
})

const codeArtifactSchema = artifactEnvelopeSchema.extend({
  kind: z.literal('code'),
  language: z.string().min(1).max(32),
  content: sized(MAX_CODE_BYTES, 'code content'),
  terminal: z.boolean().optional(),
})

const diffArtifactSchema = artifactEnvelopeSchema.extend({
  kind: z.literal('diff'),
  path: z.string().min(1).max(1024),
  stats: z
    .object({
      added: z.number().int().nonnegative(),
      removed: z.number().int().nonnegative(),
    })
    .optional(),
  hunks: z.array(
    z.object({
      id: z.string(),
      header: z.string().optional(),
      collapsed: z.boolean().optional(),
      lines: z.array(
        z.object({
          kind: z.enum(['added', 'removed', 'unchanged', 'meta']),
          oldNumber: z.number().int().nonnegative().optional(),
          newNumber: z.number().int().nonnegative().optional(),
          content: z.string(),
        }),
      ),
    }),
  ),
})

const svgArtifactSchema = artifactEnvelopeSchema.extend({
  kind: z.literal('svg'),
  content: sized(MAX_SVG_BYTES, 'svg content').refine(
    (s) => /^\s*<svg[\s>]/i.test(s),
    { message: 'svg content must begin with a <svg> element.' },
  ),
})

const whiteboardSceneArtifactSchema = artifactEnvelopeSchema.extend({
  kind: z.literal('whiteboard-scene'),
  scene: z.record(z.unknown()),
})

const slideDeckArtifactSchema = artifactEnvelopeSchema.extend({
  kind: z.literal('slide-deck'),
  source: z.union([
    sized(MAX_MARKDOWN_BYTES, 'slide-deck markdown'),
    z.array(z.record(z.unknown())).max(200),
  ]),
})

const mermaidArtifactSchema = artifactEnvelopeSchema.extend({
  kind: z.literal('mermaid'),
  content: sized(MAX_MERMAID_BYTES, 'mermaid source'),
})

const HTML_SANDBOX_MODES = ['minimal', 'scripts', 'forms'] as const
export type HtmlSandboxMode = (typeof HTML_SANDBOX_MODES)[number]

const htmlArtifactSchema = artifactEnvelopeSchema.extend({
  kind: z.literal('html'),
  srcdoc: sized(MAX_HTML_BYTES, 'html srcdoc'),
  sandbox: z.enum(HTML_SANDBOX_MODES).default('minimal'),
})

const imageDataSchema = artifactEnvelopeSchema.extend({
  kind: z.literal('image'),
  source: z.literal('data'),
  alt: z.string().min(1).max(500),
  dataUrl: z
    .string()
    .refine(
      (s) => /^data:image\/(png|jpeg|webp|gif|svg\+xml);base64,/i.test(s),
      { message: 'dataUrl must be data:image/(png|jpeg|webp|gif|svg+xml);base64,...' },
    )
    .refine((s) => s.length <= MAX_DATA_URL_BYTES, {
      message: `image data URL exceeds the ${Math.floor(MAX_DATA_URL_BYTES / 1024 / 1024)} MB cap.`,
    }),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
})

const imageUrlSchema = artifactEnvelopeSchema.extend({
  kind: z.literal('image'),
  source: z.literal('url'),
  alt: z.string().min(1).max(500),
  url: z.string().refine((s) => s.startsWith('https://'), {
    message: 'image URL must use https:// (http, data, javascript, blob are rejected).',
  }),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
})

// ───── Union ─────
// Outer schema uses `z.union` (not `z.discriminatedUnion`) so the image
// variant can carry a NESTED discriminator on `source` without
// colliding with the outer `kind` literal. The cost of the looser
// dispatch is a `safeParse` fan-out across 10 variants, which is
// negligible — agent emits at most a handful per turn.

export const artifactSchema = z.union([
  markdownArtifactSchema,
  codeArtifactSchema,
  diffArtifactSchema,
  svgArtifactSchema,
  whiteboardSceneArtifactSchema,
  slideDeckArtifactSchema,
  mermaidArtifactSchema,
  htmlArtifactSchema,
  imageDataSchema,
  imageUrlSchema,
])

export type Artifact = z.infer<typeof artifactSchema>
export type ArtifactKind = Artifact['kind']

export const ARTIFACT_KINDS: readonly ArtifactKind[] = [
  'markdown',
  'code',
  'diff',
  'svg',
  'whiteboard-scene',
  'slide-deck',
  'mermaid',
  'html',
  'image',
] as const

// ───── Validation helpers ─────

export interface ValidateOptions {
  /** When `true`, throw a `CanvasArtifactValidationError`. */
  throwOnError?: boolean
}

export function validateArtifact(
  input: unknown,
  opts: ValidateOptions = {},
): { ok: true; artifact: Artifact } | { ok: false; error: CanvasArtifactValidationError } {
  const parsed = artifactSchema.safeParse(input)
  if (parsed.success) return { ok: true, artifact: parsed.data }
  const issues = parsed.error.issues.map((i) => ({
    path: i.path.join('.'),
    message: i.message,
  }))
  const error = new CanvasArtifactValidationError(
    `Artifact rejected by schema: ${issues
      .slice(0, 3)
      .map((i) => `${i.path}: ${i.message}`)
      .join('; ')}`,
    issues,
    { cause: parsed.error },
  )
  if (opts.throwOnError === true) throw error
  return { ok: false, error }
}

export function isArtifact(input: unknown): input is Artifact {
  return artifactSchema.safeParse(input).success
}

// ───── Defence-in-depth checks that Zod does not express ─────

/**
 * Secondary pass over an artifact that catches semantic issues Zod
 * cannot express directly:
 *
 *   - SVG bodies that smuggle `<script>` or `javascript:` URLs
 *   - HTML srcdoc that attempts to open a top-level navigation
 *
 * Renderers also sanitise at render time; this is the boundary gate so
 * the wire never carries a known-bad payload.
 */
export function enforceArtifactSecurity(artifact: Artifact): void {
  if (artifact.kind === 'svg') {
    if (/<script\b/i.test(artifact.content)) {
      throw new CanvasArtifactSecurityError(
        'SVG contains <script>. Strip it client-side before publishing.',
        'svg-script-tag',
      )
    }
    if (/\sxlink:href\s*=\s*['"]\s*javascript:/i.test(artifact.content)) {
      throw new CanvasArtifactSecurityError(
        'SVG contains a javascript: xlink:href. Strip it client-side before publishing.',
        'svg-javascript-href',
      )
    }
  }
  if (artifact.kind === 'html') {
    if (/<meta\s+http-equiv\s*=\s*['"]refresh/i.test(artifact.srcdoc)) {
      throw new CanvasArtifactSecurityError(
        'HTML srcdoc contains a meta refresh. Strip it before publishing.',
        'html-meta-refresh',
      )
    }
  }
}
