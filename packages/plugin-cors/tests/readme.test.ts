import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const README_PATH = resolve(__dirname, '../README.md')

describe('T4.3 — README polish for @usetheo/plugin-cors', () => {
  it('has Installation section with package manager examples', () => {
    const content = readFileSync(README_PATH, 'utf8')
    expect(content).toContain('## Installation')
    expect(content).toContain('pnpm add @usetheo/plugin-cors')
  })

  it('has Quick start with real code example using `cors(`', () => {
    const content = readFileSync(README_PATH, 'utf8')
    expect(content).toContain('## Quick start')
    expect(content).toMatch(/cors\(\s*\{/)
    expect(content).toMatch(/defineConfig/)
  })

  it('documents all 8 options in the options table', () => {
    const content = readFileSync(README_PATH, 'utf8')
    for (const opt of [
      'origin',
      'methods',
      'allowedHeaders',
      'exposedHeaders',
      'credentials',
      'maxAge',
      'preflightContinue',
      'optionsSuccessStatus',
    ]) {
      expect(content, `option '${opt}' must appear in docs`).toContain(`\`${opt}\``)
    }
  })

  it('documents W3C invalid combo (`*` + credentials) prominently', () => {
    const content = readFileSync(README_PATH, 'utf8')
    expect(content).toMatch(/forbidden by the W3C spec|forbidden by the CORS spec/i)
    expect(content).toMatch(/origin.*\*.*credentials.*true|wildcard.*credentials/i)
  })

  it('documents no-regex policy + predicate alternative (D3)', () => {
    const content = readFileSync(README_PATH, 'utf8')
    expect(content).toMatch(/[Rr]egex/)
    expect(content).toContain('predicate')
  })

  it('documents trailing slash gotcha (EC-7)', () => {
    const content = readFileSync(README_PATH, 'utf8')
    expect(content).toMatch(/trailing slash/i)
  })

  it('documents predicate exception handling (EC-3)', () => {
    const content = readFileSync(README_PATH, 'utf8')
    expect(content).toMatch(/predicate exception|predicate throws/i)
  })

  it('has migration table from Express cors', () => {
    const content = readFileSync(README_PATH, 'utf8')
    expect(content).toMatch(/Migrating from Express/i)
    // Prettier may reformat table separator spacing; match flexibly
    expect(content).toMatch(/\|\s*Express\s*`cors`\s*option\s*\|/)
  })

  it('cross-links ADR-0008 + ADR-0011', () => {
    const content = readFileSync(README_PATH, 'utf8')
    expect(content).toContain('ADR-0008')
    expect(content).toContain('ADR-0011')
  })

  it('references peer-dep range matching current TheoKit (EC-1)', () => {
    const content = readFileSync(README_PATH, 'utf8')
    expect(content).toMatch(/theokit\s*>=\s*0\.1\.0/)
  })
})
