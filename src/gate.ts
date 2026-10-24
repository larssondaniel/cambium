import type { Severity } from './diff/index.js'
import type { Counts } from './report.js'

export const FAIL_ON_VALUES = ['breaking', 'dangerous', 'never'] as const
export type FailOn = (typeof FAIL_ON_VALUES)[number]

/**
 * What the renderer needs to know about the gate: the rule, the acceptance
 * label when one is configured, and whether it is on the pull request.
 */
export interface Gate {
  failOn: FailOn
  /** Name of the acceptance label; undefined when the mechanism is off. */
  acceptLabel?: string
  /** Whether the acceptance label is on the pull request. */
  accepted: boolean
}

/** The severities the gate fails on, worst first; none under `never`. */
export function gatedSeverities(failOn: FailOn): Severity[] {
  switch (failOn) {
    case 'breaking':
      return ['breaking']
    case 'dangerous':
      return ['breaking', 'dangerous']
    case 'never':
      return []
  }
}

/**
 * The changes at or above the gate, counted the way the failure message
 * counts them: "1 breaking change", "1 breaking and 2 dangerous changes".
 * Undefined when there are none, which is when the gate passes on its own.
 */
export function offendingChanges(
  counts: Counts,
  failOn: FailOn
): { phrase: string; total: number } | undefined {
  const severities = gatedSeverities(failOn).filter((s) => counts[s] > 0)
  if (severities.length === 0) return undefined
  const total = severities.reduce((sum, s) => sum + counts[s], 0)
  const described = severities.map((s) => `${counts[s]} ${s}`).join(' and ')
  return {
    phrase: `${described} ${total === 1 ? 'change' : 'changes'}`,
    total
  }
}
