import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  __resetPredicateWarnLoggedForTests,
  isDynamicOrigin,
  resolveOrigin,
} from '../src/resolve-origin.js'
import { validateCorsOptions } from '../src/options.js'

beforeEach(() => {
  __resetPredicateWarnLoggedForTests()
  vi.restoreAllMocks()
})

describe('T2.2 — resolveOrigin', () => {
  it('returns wildcard when opts.origin is undefined (default)', () => {
    const opts = validateCorsOptions({})
    expect(resolveOrigin('https://a.com', opts)).toBe('*')
  })

  it('returns wildcard when opts.origin is literal "*"', () => {
    const opts = validateCorsOptions({ origin: '*' })
    expect(resolveOrigin('https://a.com', opts)).toBe('*')
  })

  it('echoes request origin when opts.origin === true', () => {
    const opts = validateCorsOptions({ origin: true })
    expect(resolveOrigin('https://a.com', opts)).toBe('https://a.com')
  })

  it('returns null when request has no Origin header (server-to-server)', () => {
    const opts = validateCorsOptions({ origin: ['https://a.com'] })
    expect(resolveOrigin(undefined, opts)).toBeNull()
  })

  it('exact match for string origin', () => {
    const opts = validateCorsOptions({ origin: 'https://a.com' })
    expect(resolveOrigin('https://a.com', opts)).toBe('https://a.com')
  })

  it('returns null when string origin does not match', () => {
    const opts = validateCorsOptions({ origin: 'https://a.com' })
    expect(resolveOrigin('https://b.com', opts)).toBeNull()
  })

  it('allowlist array matches when origin in list', () => {
    const opts = validateCorsOptions({ origin: ['https://a.com', 'https://b.com'] })
    expect(resolveOrigin('https://b.com', opts)).toBe('https://b.com')
  })

  it('allowlist array returns null when not in list', () => {
    const opts = validateCorsOptions({ origin: ['https://a.com'] })
    expect(resolveOrigin('https://c.com', opts)).toBeNull()
  })

  it('predicate called with origin and returns echoed origin on true', () => {
    const opts = validateCorsOptions({ origin: (o) => o.endsWith('.example.com') })
    expect(resolveOrigin('https://sub.example.com', opts)).toBe('https://sub.example.com')
  })

  it('predicate returning false yields null', () => {
    const opts = validateCorsOptions({ origin: (_o) => false })
    expect(resolveOrigin('https://a.com', opts)).toBeNull()
  })

  describe('EC-3 — predicate exception must not cascade', () => {
    it('returns null when predicate throws (caught, not propagated)', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
      const opts = validateCorsOptions({
        origin: () => {
          throw new Error('boom')
        },
      })
      expect(resolveOrigin('https://a.com', opts)).toBeNull()
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('predicate threw'))
    })

    it('logs predicate warn only once per process (not per request)', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
      const opts = validateCorsOptions({
        origin: () => {
          throw new Error('boom')
        },
      })
      resolveOrigin('https://a.com', opts)
      resolveOrigin('https://b.com', opts)
      resolveOrigin('https://c.com', opts)
      expect(warn).toHaveBeenCalledTimes(1)
    })
  })

  describe('EC-4 / EC-5 / EC-6 / EC-7', () => {
    it('[EC-5] empty string opts.origin never matches', () => {
      const opts = validateCorsOptions({ origin: '' })
      expect(resolveOrigin('https://a.com', opts)).toBeNull()
    })

    it('[EC-6] literal "null" request origin (RFC 6454 file://) handled as string', () => {
      const opts = validateCorsOptions({ origin: ['https://a.com'] })
      expect(resolveOrigin('null', opts)).toBeNull()
    })

    it('[EC-7] trailing slash mismatch returns null', () => {
      const opts = validateCorsOptions({ origin: 'https://a.com/' })
      expect(resolveOrigin('https://a.com', opts)).toBeNull()
    })
  })
})

describe('T2.2 — isDynamicOrigin', () => {
  it('returns false for undefined opts.origin (default wildcard, constant)', () => {
    expect(isDynamicOrigin(undefined)).toBe(false)
  })

  it('returns false for "*" literal (constant)', () => {
    expect(isDynamicOrigin('*')).toBe(false)
  })

  it('returns false for single string (constant)', () => {
    expect(isDynamicOrigin('https://a.com')).toBe(false)
  })

  it('returns true for array (multiple candidates, dynamic)', () => {
    expect(isDynamicOrigin(['https://a.com', 'https://b.com'])).toBe(true)
  })

  it('returns true for predicate (computed per request)', () => {
    expect(isDynamicOrigin(() => true)).toBe(true)
  })

  it('returns true for origin: true (always echoes request)', () => {
    expect(isDynamicOrigin(true)).toBe(true)
  })
})
