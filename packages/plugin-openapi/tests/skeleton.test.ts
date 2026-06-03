/**
 * T2.1 — Scaffold smoke. Asserts the package structure (package.json shape,
 * single-entry tsup config per ADR D2, MIT license, README has quickstart).
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const ROOT = resolve(__dirname, '..')

describe('T2.1 — package skeleton', () => {
  it('package.json has required fields', () => {
    const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf-8')) as Record<
      string,
      unknown
    >
    expect(pkg.name).toBe('@theokit/plugin-openapi')
    expect(pkg.version).toBeDefined()
    expect((pkg.peerDependencies as Record<string, string>).theokit).toMatch(/^>=/)
    expect((pkg.exports as Record<string, unknown>)['.']).toBeDefined()
  })

  it('tsup.config.ts uses single-entry shape (NOT multi-entry per ADR D2)', () => {
    const src = readFileSync(resolve(ROOT, 'tsup.config.ts'), 'utf-8')
    // ADR D2 absorbed EC-6: NO multi-entry like plugin-canvas (./ui ./server)
    expect(src).toMatch(/entry:\s*\['src\/index\.ts'\]/)
    // Negative control: must NOT contain the canvas-style multi-entry object
    expect(src).not.toMatch(/entry:\s*\{[\s\S]*['"]ui\/index['"]/)
  })

  it('LICENSE first line contains MIT', () => {
    const lic = readFileSync(resolve(ROOT, 'LICENSE'), 'utf-8')
    expect(lic.split('\n')[0]).toMatch(/MIT/i)
  })

  it('README has Quickstart section + openApiPlugin import snippet', () => {
    const readme = readFileSync(resolve(ROOT, 'README.md'), 'utf-8')
    expect(readme).toMatch(/##\s+Quickstart/i)
    expect(readme).toMatch(/import openApiPlugin from ['"]@theokit\/plugin-openapi['"]/)
  })
})
