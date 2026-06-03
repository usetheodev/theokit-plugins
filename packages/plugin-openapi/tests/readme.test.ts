/**
 * T2.3 — README meta test (mirrors plugin-cors/tests/readme.test.ts).
 *
 * Asserts the README contains the load-bearing sections users need to
 * adopt the plugin. Catches doc drift cheaply.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const README = readFileSync(resolve(__dirname, '..', 'README.md'), 'utf-8')

describe('T2.3 — README hygiene', () => {
  it('has Quickstart section', () => {
    expect(README).toMatch(/##\s+Quickstart/i)
  })

  it('has Offline mode section', () => {
    expect(README).toMatch(/##\s+Offline mode/i)
  })

  it('has openApiPlugin import snippet referencing the @usetheo scope', () => {
    expect(README).toMatch(
      /import openApiPlugin from ['"]@theokit\/plugin-openapi['"]/,
    )
  })
})
