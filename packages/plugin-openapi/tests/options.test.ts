/**
 * T2.2 — Zod options validation.
 *
 * Per P#3 plan v1.3 T2.2 + v1.1 EC absorption (path-traversal refine) +
 * v1.3 EC-4 (path-collision refine) + v1.3 EC-5 (https-only refine).
 *
 * 11 RED tests total:
 *  - 4 defaults / override
 *  - 3 base rejection (invalid url, missing slash, strict unknown key)
 *  - 1 error class shape
 *  - 3 v1.1+v1.3 absorbed refines
 */
import { describe, expect, it } from 'vitest'

import {
  OpenApiPluginConfigError,
  validateOpenApiOptions,
} from '../src/options.js'

describe('validateOpenApiOptions — defaults & overrides', () => {
  it('returns defaults when no options passed', () => {
    const opts = validateOpenApiOptions()
    expect(opts.docsPath).toBe('/api/docs')
    expect(opts.openapiJsonPath).toBe('/api/docs/openapi.json')
    expect(opts.openapiSourcePath).toBe('.theo/openapi.json')
    expect(opts.cdnUrl).toBe('https://cdn.jsdelivr.net/npm/@scalar/api-reference')
    expect(opts.pageTitle).toBe('API Reference')
  })

  it('returns defaults when empty object passed', () => {
    const opts = validateOpenApiOptions({})
    expect(opts.docsPath).toBe('/api/docs')
  })

  it('overrides docsPath', () => {
    const opts = validateOpenApiOptions({ docsPath: '/custom/docs' })
    expect(opts.docsPath).toBe('/custom/docs')
  })

  it('overrides cdnUrl with a valid https URL', () => {
    const opts = validateOpenApiOptions({ cdnUrl: 'https://my-cdn.com/scalar.js' })
    expect(opts.cdnUrl).toBe('https://my-cdn.com/scalar.js')
  })
})

describe('validateOpenApiOptions — base rejections', () => {
  it('rejects invalid cdnUrl format', () => {
    expect(() => validateOpenApiOptions({ cdnUrl: 'not-a-url' })).toThrow(
      OpenApiPluginConfigError,
    )
  })

  it('rejects docsPath without leading slash', () => {
    expect(() => validateOpenApiOptions({ docsPath: 'api/docs' })).toThrow(
      OpenApiPluginConfigError,
    )
  })

  it('rejects unknown keys (strict mode — typo defense)', () => {
    // @ts-expect-error testing runtime rejection of unknown key
    expect(() => validateOpenApiOptions({ unknownKey: true })).toThrow(
      OpenApiPluginConfigError,
    )
  })
})

describe('OpenApiPluginConfigError class', () => {
  it('extends Error and exposes the Zod issue list', () => {
    try {
      validateOpenApiOptions({ cdnUrl: 'not-a-url' })
      expect.unreachable('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(OpenApiPluginConfigError)
      expect(err).toBeInstanceOf(Error)
      // ZodError carried as cause (or .issues on the custom error)
      const e = err as OpenApiPluginConfigError
      expect(e.message).toMatch(/cdnUrl|url/i)
    }
  })
})

describe('v1.1 — path-traversal refine on openapiSourcePath', () => {
  it('rejects openapiSourcePath containing ".."', () => {
    expect(() =>
      validateOpenApiOptions({ openapiSourcePath: '../../etc/passwd' }),
    ).toThrow(OpenApiPluginConfigError)
  })
})

describe('v1.3 EC-4 — docsPath !== openapiJsonPath collision refine', () => {
  it('rejects when docsPath equals openapiJsonPath', () => {
    expect(() =>
      validateOpenApiOptions({
        docsPath: '/api/docs',
        openapiJsonPath: '/api/docs',
      }),
    ).toThrow(OpenApiPluginConfigError)
  })
})

describe('v1.3 EC-5 — cdnUrl MUST use https://', () => {
  it('rejects cdnUrl with http:// scheme (mixed-content defense)', () => {
    expect(() =>
      validateOpenApiOptions({ cdnUrl: 'http://my-cdn.com/s.js' }),
    ).toThrow(OpenApiPluginConfigError)
  })

  it('accepts cdnUrl with https:// scheme (positive control)', () => {
    expect(() =>
      validateOpenApiOptions({ cdnUrl: 'https://my-cdn.com/s.js' }),
    ).not.toThrow()
  })
})
