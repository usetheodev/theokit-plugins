/**
 * T3.3 — index smoke. Asserts default export shape + type re-exports.
 */
import { describe, expect, it } from 'vitest'

import openApiPlugin, {
  type OpenApiOptions,
  OpenApiPluginConfigError,
} from '../src/index.js'

describe('@theokit/plugin-openapi index smoke', () => {
  it('default export is a function', () => {
    expect(typeof openApiPlugin).toBe('function')
  })

  it('default export returns a TheoPlugin with name + register', () => {
    const p = openApiPlugin()
    expect(p.name).toBe('@theokit/plugin-openapi')
    expect(typeof p.register).toBe('function')
  })

  it('OpenApiPluginConfigError is re-exported', () => {
    expect(OpenApiPluginConfigError).toBeDefined()
    const err = new OpenApiPluginConfigError('test')
    expect(err).toBeInstanceOf(Error)
  })

  it('OpenApiOptions type is exported (compile-time check)', () => {
    const opts: OpenApiOptions = { docsPath: '/api/docs' }
    expect(opts.docsPath).toBe('/api/docs')
  })
})
