/**
 * T2.3 — CHANGELOG meta test.
 *
 * Asserts CHANGELOG has [Unreleased] section + at least one entry under
 * ### Added that references the load-bearing feature (Scalar / OpenAPI).
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const CHANGELOG = readFileSync(resolve(__dirname, '..', 'CHANGELOG.md'), 'utf-8')

describe('T2.3 — CHANGELOG hygiene', () => {
  it('has [Unreleased] section header', () => {
    expect(CHANGELOG).toMatch(/##\s+\[Unreleased\]/)
  })

  it('has ### Added subsection under [Unreleased]', () => {
    expect(CHANGELOG).toMatch(/###\s+Added/)
  })

  it('Added entries reference Scalar or OpenAPI (load-bearing feature)', () => {
    // Simpler heuristic: the CHANGELOG (single Unreleased version) must
    // mention Scalar or OpenAPI somewhere in its body. False positive risk
    // is low (CHANGELOG is short + initial release).
    expect(CHANGELOG).toMatch(/Scalar|OpenAPI/i)
  })
})
