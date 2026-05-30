import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const ADR_DIR = resolve(__dirname, '../../../docs/adr')
const ADR_0012_PATH = resolve(ADR_DIR, '0012-plugin-sentry-proposed.md')
const ADR_0013_PATH = resolve(ADR_DIR, '0013-plugin-i18n-proposed.md')

describe('T6.2 — stub ADRs 0012 (sentry) + 0013 (i18n)', () => {
  it('both ADRs exist in theokit-plugins/docs/adr/', () => {
    expect(existsSync(ADR_0012_PATH)).toBe(true)
    expect(existsSync(ADR_0013_PATH)).toBe(true)
  })

  describe('ADR-0012 sentry', () => {
    it('has Status: proposed', () => {
      const content = readFileSync(ADR_0012_PATH, 'utf8')
      expect(content).toContain('Status: proposed')
    })

    it('mentions sentry + target implementation date', () => {
      const content = readFileSync(ADR_0012_PATH, 'utf8')
      expect(content).toMatch(/sentry/i)
      expect(content).toMatch(/Target implementation start/)
      expect(content).toMatch(/2 weeks/)
    })

    it('has Open questions section', () => {
      const content = readFileSync(ADR_0012_PATH, 'utf8')
      expect(content).toContain('## Open questions')
    })

    it('self-describes as intentionally light', () => {
      const content = readFileSync(ADR_0012_PATH, 'utf8')
      expect(content).toMatch(/intentionally light|to be drafted/i)
    })

    it('cross-links ADR-0011', () => {
      const content = readFileSync(ADR_0012_PATH, 'utf8')
      expect(content).toMatch(/ADR-0011|0011-moderate-plugin-roadmap/)
    })
  })

  describe('ADR-0013 i18n', () => {
    it('has Status: proposed', () => {
      const content = readFileSync(ADR_0013_PATH, 'utf8')
      expect(content).toContain('Status: proposed')
    })

    it('mentions i18n + target implementation date', () => {
      const content = readFileSync(ADR_0013_PATH, 'utf8')
      expect(content).toMatch(/i18n|internationalization/i)
      expect(content).toMatch(/Target implementation start/)
      expect(content).toMatch(/6 weeks/)
    })

    it('has Open questions section', () => {
      const content = readFileSync(ADR_0013_PATH, 'utf8')
      expect(content).toContain('## Open questions')
    })

    it('self-describes as intentionally light', () => {
      const content = readFileSync(ADR_0013_PATH, 'utf8')
      expect(content).toMatch(/intentionally light|to be drafted/i)
    })

    it('cross-links ADR-0011 + ADR-0012', () => {
      const content = readFileSync(ADR_0013_PATH, 'utf8')
      expect(content).toMatch(/ADR-0011/)
      expect(content).toMatch(/ADR-0012/)
    })
  })
})
