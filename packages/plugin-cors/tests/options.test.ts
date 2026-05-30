import { describe, expect, expectTypeOf, it } from 'vitest'
import { corsOptionsSchema, validateCorsOptions, type CorsOptions } from '../src/options.js'

describe('T2.1 — CorsOptions schema + validation', () => {
  describe('happy path', () => {
    it('accepts a fully populated valid config', () => {
      const opts: CorsOptions = {
        origin: ['https://a.example.com', 'https://b.example.com'],
        methods: ['GET', 'POST'],
        allowedHeaders: ['X-Custom'],
        exposedHeaders: ['X-Foo'],
        credentials: true,
        maxAge: 600,
        preflightContinue: false,
        optionsSuccessStatus: 204,
      }
      expect(() => validateCorsOptions(opts)).not.toThrow()
    })

    it('accepts wildcard origin without credentials', () => {
      expect(() => validateCorsOptions({ origin: '*' })).not.toThrow()
    })

    it('accepts predicate origin', () => {
      const opts: CorsOptions = { origin: (o) => o.endsWith('.example.com') }
      expect(() => validateCorsOptions(opts)).not.toThrow()
    })

    it('accepts origin: true (echo without credentials)', () => {
      expect(() => validateCorsOptions({ origin: true })).not.toThrow()
    })
  })

  describe('validation errors', () => {
    it('rejects unknown keys (.strict() schema)', () => {
      const opts = { origin: '*', invalidKey: 'foo' } as unknown as CorsOptions
      expect(() => validateCorsOptions(opts)).toThrow()
    })

    it('rejects origin: false (not in union)', () => {
      const opts = { origin: false } as unknown as CorsOptions
      expect(() => validateCorsOptions(opts)).toThrow()
    })

    it('[W3C] throws on origin:* with credentials:true', () => {
      expect(() => validateCorsOptions({ origin: '*', credentials: true })).toThrow(
        /forbidden by the CORS spec/,
      )
    })

    it('[W3C] error message includes actionable suggestion', () => {
      expect(() => validateCorsOptions({ origin: '*', credentials: true })).toThrow(
        /specific origin|predicate/,
      )
    })
  })

  describe('EC-8 — async predicate behavior', () => {
    it('schema wraps function; async predicate returning Promise<boolean> fails type check', () => {
      // Zod 3's z.function().returns(z.boolean()) wraps the user-provided
      // function. If the user passes an async function (returns Promise),
      // calling the wrapped function asserts the boolean return type and
      // throws ZodError at invocation time.
      const asyncPredicate = async (_o: string): Promise<boolean> => {
        await Promise.resolve()
        return true
      }
      const opts = {
        origin: asyncPredicate as unknown as (o: string) => boolean,
      } as unknown as CorsOptions
      const result = corsOptionsSchema.safeParse(opts)
      if (result.success) {
        const origin = result.data.origin
        // result.data.origin is the wrapped function in Zod 3
        if (typeof origin === 'function') {
          // Invoking the wrapped function throws when actual return doesn't
          // satisfy z.boolean() schema (Promise is not boolean)
          expect(() => origin('https://a.com')).toThrow()
        } else {
          throw new Error('expected origin to be a wrapped function')
        }
      } else {
        // If a stricter Zod version rejects at parse, that's also acceptable
        expect(result.success).toBe(false)
      }
    })
  })

  describe('EC-9 — empty strings in arrays rejected', () => {
    it('rejects exposedHeaders containing empty string', () => {
      const opts: CorsOptions = { exposedHeaders: ['X-Foo', ''] }
      expect(() => validateCorsOptions(opts)).toThrow()
    })

    it('rejects allowedHeaders containing empty string', () => {
      const opts: CorsOptions = { allowedHeaders: [''] }
      expect(() => validateCorsOptions(opts)).toThrow()
    })

    it('rejects methods containing empty string', () => {
      const opts: CorsOptions = { methods: ['GET', ''] }
      expect(() => validateCorsOptions(opts)).toThrow()
    })

    it('rejects origin array containing empty string', () => {
      const opts: CorsOptions = { origin: ['https://a.com', ''] }
      expect(() => validateCorsOptions(opts)).toThrow()
    })
  })

  describe('edge cases', () => {
    it('accepts empty object (all options optional)', () => {
      expect(() => validateCorsOptions({})).not.toThrow()
    })

    it('rejects maxAge negative', () => {
      const opts: CorsOptions = { maxAge: -1 }
      expect(() => validateCorsOptions(opts)).toThrow()
    })

    it('rejects optionsSuccessStatus outside 2xx', () => {
      expect(() => validateCorsOptions({ optionsSuccessStatus: 404 })).toThrow()
      expect(() => validateCorsOptions({ optionsSuccessStatus: 100 })).toThrow()
    })

    it('CorsOptions type inferred correctly', () => {
      expectTypeOf<CorsOptions['origin']>().toMatchTypeOf<
        string | string[] | true | ((o: string) => boolean) | undefined
      >()
      expectTypeOf<CorsOptions['credentials']>().toEqualTypeOf<boolean | undefined>()
    })
  })
})
