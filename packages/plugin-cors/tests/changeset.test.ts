import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const CHANGESET_PATH = resolve(__dirname, '../../../.changeset/initial-cors-release.md')

describe('T1.2 — initial changeset for @theokit/plugin-cors@0.1.0', () => {
  it('changeset file exists (happy path)', () => {
    expect(existsSync(CHANGESET_PATH)).toBe(true)
  })

  it('frontmatter bumps @theokit/plugin-cors at minor (validation error if wrong bump)', () => {
    const content = readFileSync(CHANGESET_PATH, 'utf8')
    expect(content).toMatch(/^---\n['"]?@theokit\/plugin-cors['"]?:\s*minor\n---/)
  })

  it('body documents CORS feature scope (W3C spec mention)', () => {
    const content = readFileSync(CHANGESET_PATH, 'utf8')
    expect(content).toMatch(/W3C/)
    expect(content).toMatch(/preflight/)
    expect(content).toMatch(/origin/)
  })

  it('body references peer-dep range (EC-1 fix: matches current TheoKit)', () => {
    const content = readFileSync(CHANGESET_PATH, 'utf8')
    expect(content).toMatch(/theokit\s*>=\s*0\.1\.0/)
  })

  it('[EC-6] body under 1500 chars (relaxed from 700 — initial release deserves context)', () => {
    const content = readFileSync(CHANGESET_PATH, 'utf8')
    // Body is the content after the closing `---` of frontmatter
    const bodyMatch = content.split(/\n---\n/, 2)[1] ?? content
    expect(bodyMatch.length).toBeLessThan(1500)
  })
})
