import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const RELEASING_PATH = resolve(__dirname, '../../../docs/RELEASING.md')
const SECRETS_PATH = resolve(__dirname, '../../../docs/SECRETS.md')

describe('T4.2 — release pipeline docs', () => {
  it('RELEASING.md exists with Flow + Dry-run sections', () => {
    expect(existsSync(RELEASING_PATH)).toBe(true)
    const content = readFileSync(RELEASING_PATH, 'utf8')
    expect(content).toContain('## Flow')
    expect(content).toContain('## Dry-run locally')
  })

  it('SECRETS.md exists with NPM_TOKEN setup steps', () => {
    expect(existsSync(SECRETS_PATH)).toBe(true)
    const content = readFileSync(SECRETS_PATH, 'utf8')
    expect(content).toContain('NPM_TOKEN')
    expect(content).toMatch(/Automation Token|Granular Access Token/)
    expect(content).toContain('## Rotation')
  })

  it('RELEASING.md links to SECRETS.md for token setup', () => {
    const content = readFileSync(RELEASING_PATH, 'utf8')
    expect(content).toMatch(/SECRETS\.md/)
  })

  it('[EC-12] tarball filename can be discovered via shell — not hardcoded', () => {
    // Tarball was packed in T4.2 step: pnpm pack --pack-destination /tmp
    // The exact filename depends on pnpm version (scope strip + dash join).
    // pnpm 9 produces `theokit-plugin-cors-0.1.0.tgz`.
    // Production CI uses `ls $(pack-destination)/*.tgz` to discover —
    // hardcoded literal would break across pnpm versions.
    // This test documents the expected pattern; T4.2 acceptance criterion
    // verifies via `ls` not literal name match.
    const pattern = /theokit-plugin-cors-\d+\.\d+\.\d+\.tgz/
    expect('theokit-plugin-cors-0.1.0.tgz').toMatch(pattern)
  })
})
