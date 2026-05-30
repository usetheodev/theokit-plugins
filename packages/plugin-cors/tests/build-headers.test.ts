import { describe, expect, it } from 'vitest'
import { buildCorsHeaders } from '../src/build-headers.js'
import { validateCorsOptions } from '../src/options.js'

describe('T2.2 — buildCorsHeaders', () => {
  it('returns empty headers when resolvedOrigin is null (no match — caller adds nothing)', () => {
    const opts = validateCorsOptions({ origin: ['https://a.com'] })
    expect(buildCorsHeaders(opts, null, false)).toEqual({})
    expect(buildCorsHeaders(opts, null, true)).toEqual({})
  })

  it('sets Allow-Origin on basic non-preflight response', () => {
    const opts = validateCorsOptions({ origin: 'https://a.com' })
    const h = buildCorsHeaders(opts, 'https://a.com', false)
    expect(h['Access-Control-Allow-Origin']).toBe('https://a.com')
  })

  it('does NOT add preflight headers on non-preflight', () => {
    const opts = validateCorsOptions({ origin: '*', methods: ['GET'], maxAge: 300 })
    const h = buildCorsHeaders(opts, '*', false)
    expect(h['Access-Control-Allow-Methods']).toBeUndefined()
    expect(h['Access-Control-Max-Age']).toBeUndefined()
  })

  it('adds preflight headers when isPreflight=true', () => {
    const opts = validateCorsOptions({
      origin: '*',
      methods: ['GET', 'POST'],
      allowedHeaders: ['X-Custom'],
      maxAge: 600,
    })
    const h = buildCorsHeaders(opts, '*', true)
    expect(h['Access-Control-Allow-Methods']).toBe('GET, POST')
    expect(h['Access-Control-Allow-Headers']).toBe('X-Custom')
    expect(h['Access-Control-Max-Age']).toBe('600')
  })

  it('uses default methods when methods option omitted', () => {
    const opts = validateCorsOptions({ origin: '*' })
    const h = buildCorsHeaders(opts, '*', true)
    expect(h['Access-Control-Allow-Methods']).toBe('GET, HEAD, PUT, PATCH, POST, DELETE')
  })

  it('emits Vary: Origin when origin is dynamic (array)', () => {
    const opts = validateCorsOptions({ origin: ['https://a.com', 'https://b.com'] })
    const h = buildCorsHeaders(opts, 'https://a.com', false)
    expect(h.Vary).toBe('Origin')
  })

  it('emits Vary: Origin when origin is predicate', () => {
    const opts = validateCorsOptions({ origin: (o) => o.endsWith('.example.com') })
    const h = buildCorsHeaders(opts, 'https://sub.example.com', false)
    expect(h.Vary).toBe('Origin')
  })

  it('emits Vary: Origin when origin === true (always echoes)', () => {
    const opts = validateCorsOptions({ origin: true })
    const h = buildCorsHeaders(opts, 'https://a.com', false)
    expect(h.Vary).toBe('Origin')
  })

  it('does NOT emit Vary when origin is static string', () => {
    const opts = validateCorsOptions({ origin: 'https://a.com' })
    const h = buildCorsHeaders(opts, 'https://a.com', false)
    expect(h.Vary).toBeUndefined()
  })

  it('does NOT emit Vary when origin is "*"', () => {
    const opts = validateCorsOptions({ origin: '*' })
    const h = buildCorsHeaders(opts, '*', false)
    expect(h.Vary).toBeUndefined()
  })

  it('adds Allow-Credentials when credentials:true', () => {
    const opts = validateCorsOptions({ origin: 'https://a.com', credentials: true })
    const h = buildCorsHeaders(opts, 'https://a.com', false)
    expect(h['Access-Control-Allow-Credentials']).toBe('true')
  })

  it('joins exposedHeaders with comma-space (HTTP list separator)', () => {
    const opts = validateCorsOptions({
      origin: '*',
      exposedHeaders: ['X-Foo', 'X-Bar', 'X-Baz'],
    })
    const h = buildCorsHeaders(opts, '*', false)
    expect(h['Access-Control-Expose-Headers']).toBe('X-Foo, X-Bar, X-Baz')
  })

  it('[EC-4] methods empty array yields empty Allow-Methods header value', () => {
    const opts = validateCorsOptions({ origin: '*', methods: [] })
    const h = buildCorsHeaders(opts, '*', true)
    // Documents browser behavior — empty value means no methods allowed
    expect(h['Access-Control-Allow-Methods']).toBe('')
  })

  it('omits allowedHeaders header when option not set (caller may echo from request)', () => {
    const opts = validateCorsOptions({ origin: '*' })
    const h = buildCorsHeaders(opts, '*', true)
    expect(h['Access-Control-Allow-Headers']).toBeUndefined()
  })
})
