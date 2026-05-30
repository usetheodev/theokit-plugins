/**
 * Workspace-level structural test for ROADMAP.md. Lives in plugin-cors's
 * tests/ because the package-less workspace doesn't have its own test runner.
 */
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROADMAP_PATH = resolve(__dirname, '../../../ROADMAP.md')

describe('T6.1 — theokit-plugins/ROADMAP.md', () => {
  it('exists at workspace root', () => {
    expect(existsSync(ROADMAP_PATH)).toBe(true)
  })

  it('has Committed section', () => {
    const content = readFileSync(ROADMAP_PATH, 'utf8')
    expect(content).toContain('## Committed')
  })

  it('has Demand-gated section', () => {
    const content = readFileSync(ROADMAP_PATH, 'utf8')
    expect(content).toContain('## Demand-gated')
  })

  it('lists 3 committed plugins (cors + sentry + i18n)', () => {
    const content = readFileSync(ROADMAP_PATH, 'utf8')
    expect(content).toContain('@usetheo/plugin-cors')
    expect(content).toContain('@usetheo/plugin-sentry')
    expect(content).toContain('@usetheo/plugin-i18n')
  })

  it('lists 6 demand-gated plugins with 0 evidence', () => {
    const content = readFileSync(ROADMAP_PATH, 'utf8')
    for (const name of [
      '@usetheo/plugin-otel',
      '@usetheo/plugin-resend',
      '@usetheo/plugin-stripe-webhooks',
      '@usetheo/plugin-clerk',
      '@usetheo/plugin-feature-flags',
      '@usetheo/plugin-inngest',
    ]) {
      expect(content, `${name} must appear in demand-gated table`).toContain(name)
    }
  })

  it('cites ADR-0011 (TheoKit core)', () => {
    const content = readFileSync(ROADMAP_PATH, 'utf8')
    expect(content).toMatch(/ADR-0011|0011-moderate-plugin-roadmap/)
  })

  it('[EC-11] no literal "2026-MM-DD" placeholder remains', () => {
    const content = readFileSync(ROADMAP_PATH, 'utf8')
    expect(content).not.toMatch(/2026-MM-DD/)
  })

  it('[EC-13] includes TheoKit compatibility matrix subsection', () => {
    const content = readFileSync(ROADMAP_PATH, 'utf8')
    expect(content).toMatch(/TheoKit compatibility matrix/i)
    expect(content).toMatch(/peer-dep|tested/i)
  })

  it('documents exclusions (what core already ships)', () => {
    const content = readFileSync(ROADMAP_PATH, 'utf8')
    expect(content).toMatch(/Exclusions|already in core/i)
    expect(content).toContain('usePostgres')
    expect(content).toContain('defineWebhook')
  })

  it('lists temporal gates for committed plugins', () => {
    const content = readFileSync(ROADMAP_PATH, 'utf8')
    expect(content).toMatch(/2 weeks/)
    expect(content).toMatch(/6 weeks/)
  })
})
