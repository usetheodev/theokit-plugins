import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import fixtureConfig from './fixtures/cors-app/theo.config.js'

const FIXTURE_DIR = resolve(__dirname, 'fixtures/cors-app')

describe('T3.1 — cors-app fixture (real TheoKit boot via D7 cross-repo)', () => {
  it('fixture theo.config.ts evaluates to a TheoConfig with plugins[] populated (happy path)', () => {
    expect(fixtureConfig).toBeDefined()
    expect(Array.isArray(fixtureConfig.plugins)).toBe(true)
    expect((fixtureConfig.plugins ?? []).length).toBeGreaterThan(0)
  })

  it('fixture plugin is the @usetheo/plugin-cors TheoPlugin shape', () => {
    const plugins = (fixtureConfig.plugins ?? []) as { name?: string; register?: unknown }[]
    const cors = plugins.find((p) => p?.name === '@usetheo/plugin-cors')
    expect(cors).toBeDefined()
    expect(typeof cors?.register).toBe('function')
  })

  it('fixture options pass W3C validation (no throw at config load)', () => {
    // If the fixture had invalid combo like origin:'*' + credentials:true,
    // loading the module above would have thrown. Reaching this `it` proves it.
    expect(fixtureConfig).toBeDefined()
  })

  it('fixture route handler file present + exports default', async () => {
    const routePath = resolve(FIXTURE_DIR, 'server/routes/health.ts')
    expect(existsSync(routePath)).toBe(true)
    const route = (await import('./fixtures/cors-app/server/routes/health.js')) as {
      default: { handler?: unknown }
    }
    expect(route.default).toBeDefined()
    // Method is inferred from filename in TheoKit's file-router; only handler is required.
    expect(typeof route.default.handler).toBe('function')
  })

  it('fixture README documents the cross-repo workspace pattern (D7)', () => {
    const readme = readFileSync(resolve(FIXTURE_DIR, 'README.md'), 'utf8')
    expect(readme).toMatch(/D7|cross-repo|link:/)
    expect(readme).toContain('theokit')
  })
})
