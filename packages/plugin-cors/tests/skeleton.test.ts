import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import corsPlugin from '../src/index.js'

const PKG_PATH = resolve(__dirname, '../package.json')
const TSCONFIG_PATH = resolve(__dirname, '../tsconfig.json')

interface PkgShape {
  name: string
  version: string
  type: 'module'
  exports: Record<string, { types?: string; import?: string }>
  peerDependencies: Record<string, string>
  dependencies?: Record<string, string>
}

describe('T1.1 — plugin-cors scaffold', () => {
  it('package.json has correct shape (EC-1: peer-dep matches current TheoKit)', () => {
    const pkg = JSON.parse(readFileSync(PKG_PATH, 'utf8')) as PkgShape
    expect(pkg.name).toBe('@theokit/plugin-cors')
    expect(pkg.version).toBe('0.1.0')
    expect(pkg.type).toBe('module')
    expect(pkg.exports['.']?.types).toBe('./dist/index.d.ts')
    expect(pkg.exports['.']?.import).toBe('./dist/index.js')
    // EC-1 fix: must match current TheoKit version, not the hypothetical >=0.5.0
    expect(pkg.peerDependencies['theokit']).toBe('>=0.1.0-alpha.5')
    expect(pkg.dependencies?.['zod']).toBeDefined()
  })

  it('stub default export returns a TheoPlugin shape', () => {
    const plugin = corsPlugin({})
    expect(plugin.name).toBe('@theokit/plugin-cors')
    expect(typeof plugin.register).toBe('function')
  })

  it('tsconfig extends workspace base', () => {
    const ts = JSON.parse(readFileSync(TSCONFIG_PATH, 'utf8')) as { extends: string }
    expect(ts.extends).toBe('../../tsconfig.base.json')
  })

  it('packages/.gitkeep removed after first package lands', () => {
    const gitkeep = resolve(__dirname, '../../../packages/.gitkeep')
    expect(existsSync(gitkeep)).toBe(false)
  })

  it('LICENSE file present (required for publish)', () => {
    const license = resolve(__dirname, '../LICENSE')
    expect(existsSync(license)).toBe(true)
    expect(readFileSync(license, 'utf8')).toContain('MIT')
  })
})
