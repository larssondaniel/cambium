/**
 * Drift guard: every change kind graphql-js can report has a fixture pair, so
 * a new kind in a graphql-js release cannot slip through as UNRECOGNIZED
 * without a failing test.
 */
import { describe, expect, it } from '@jest/globals'
import {
  BreakingChangeType,
  DangerousChangeType,
  SafeChangeType
} from 'graphql'
import {
  BREAKING_KINDS,
  DANGEROUS_KINDS,
  SAFE_KINDS
} from '../__fixtures__/change-kinds.js'

const fixtureKinds = [...BREAKING_KINDS, ...DANGEROUS_KINDS, ...SAFE_KINDS].map(
  (f) => f.kind
)

describe.each([
  ['breaking', BreakingChangeType],
  ['dangerous', DangerousChangeType],
  ['safe', SafeChangeType]
])('every %s kind graphql-js reports', (_severity, catalogue) => {
  it.each(Object.values(catalogue))('%s has a fixture pair', (kind) => {
    expect(
      fixtureKinds.some((k) => k === kind || k.startsWith(`${kind} `))
    ).toBe(true)
  })
})
