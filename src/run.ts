import { diffSchemas } from './diff/index.js'
import type { GitHubPort, StickyCommentResult } from './github.js'
import { countsOf, inventoryOf, type Counts, type Report } from './report.js'
import { render } from './render.js'
import { loadSchema, SchemaFileError, shortSha } from './schema-file.js'

export interface RunInputs {
  /** Path of the schema file in the repository. */
  schema: string
  /** Severity at or above which the step fails: `breaking`, `dangerous` or `never`. */
  failOn: string
}

export interface PullRequest {
  number: number
  baseSha: string
  headSha: string
  /** True when the head repository is not the base repository. */
  fromFork: boolean
}

export interface RunOptions {
  inputs: RunInputs
  pullRequest: PullRequest
  github: GitHubPort
  /** URL of the workflow run, so a truncated comment can point at the job summary. */
  summaryUrl?: string
}

export interface RunOutcome {
  /** Set whenever a report was produced, even when the step fails. */
  outputs?: Counts
  /** Message the step fails with, when it fails. */
  failure?: string
  /** A notice annotation to emit. */
  notice?: string
}

const FAIL_ON_VALUES = ['breaking', 'dangerous', 'never'] as const
type FailOn = (typeof FAIL_ON_VALUES)[number]

/** Comments above this length are truncated; GitHub's limit is 65,536 characters. */
export const COMMENT_BUDGET = 60_000

export const PERMISSIONS_HINT = [
  'permissions:',
  '  contents: read',
  '  pull-requests: write'
].join('\n')

/**
 * The orchestrator: resolves the merge-base, reads the schema file at both
 * commits, diffs, renders, writes the summary, posts the sticky comment when
 * it can, and applies the gate.
 */
export async function run({
  inputs,
  pullRequest,
  github,
  summaryUrl
}: RunOptions): Promise<RunOutcome> {
  const failOn = parseFailOn(inputs.failOn)
  if (!failOn) {
    return {
      failure: `\`fail-on\` must be one of ${FAIL_ON_VALUES.join(', ')}; got "${inputs.failOn}".`
    }
  }

  const schemaPath = inputs.schema
  if (schemaPath.includes('-->')) {
    return {
      failure: `\`schema\` must not contain \`-->\`; got "${schemaPath}".`
    }
  }

  const mergeBase = await github.resolveMergeBase(
    pullRequest.baseSha,
    pullRequest.headSha
  )
  const [baseText, headText] = await Promise.all([
    github.readFile(schemaPath, mergeBase),
    github.readFile(schemaPath, pullRequest.headSha)
  ])

  let report: Report | undefined
  try {
    report = buildReport(
      schemaPath,
      baseText,
      headText,
      mergeBase,
      pullRequest.headSha
    )
  } catch (error) {
    if (error instanceof SchemaFileError) return { failure: error.message }
    throw error
  }
  if (!report) {
    return {
      failure:
        `\`${schemaPath}\` does not exist at the merge-base (${shortSha(mergeBase)}) ` +
        `or at the head (${shortSha(pullRequest.headSha)}). Check the \`schema\` input.`
    }
  }

  const counts = countsOf(report)
  await github.writeSummary(render(report))

  const outcome: RunOutcome = { outputs: counts }
  if (pullRequest.fromFork) {
    outcome.notice =
      'This pull request comes from a fork, so Cambium cannot comment on it. The report is in the job summary.'
  } else {
    const marker = stickyMarker(schemaPath)
    let result: StickyCommentResult
    try {
      result = await github.upsertStickyComment({
        marker,
        body: `${render(report, { budget: COMMENT_BUDGET, summaryUrl })}\n${marker}`,
        createIfMissing: !(
          report.event === 'changed' && report.changes.length === 0
        )
      })
    } catch (error) {
      // The report and the outputs are already there; only the comment is lost.
      outcome.failure = `Could not comment on the pull request: ${messageOf(error)}`
      return outcome
    }
    if (result === 'forbidden') {
      outcome.failure =
        'Could not comment on the pull request: GitHub returned 403. ' +
        `Add these lines to the job's \`permissions:\` block:\n\n${PERMISSIONS_HINT}`
      return outcome
    }
  }

  outcome.failure = gate(counts, failOn, schemaPath)
  return outcome
}

/** The hidden marker that makes the comment sticky, one per schema file. */
export function stickyMarker(schemaPath: string): string {
  return `<!-- cambium: schema=${schemaPath} -->`
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function parseFailOn(value: string): FailOn | undefined {
  return FAIL_ON_VALUES.find((v) => v === value)
}

/**
 * Applies the absent-file rules. Returns `undefined` when the file is absent
 * at both commits; throws `SchemaFileError` when a present file cannot be
 * parsed.
 */
function buildReport(
  schemaPath: string,
  baseText: string | undefined,
  headText: string | undefined,
  mergeBase: string,
  headSha: string
): Report | undefined {
  if (baseText === undefined && headText === undefined) return undefined
  if (headText === undefined) return { event: 'schema-removed', schemaPath }

  const head = loadSchema(headText, schemaPath, { label: 'head', sha: headSha })
  if (baseText === undefined) {
    return { event: 'new-schema', schemaPath, inventory: inventoryOf(head) }
  }
  const base = loadSchema(baseText, schemaPath, {
    label: 'base',
    sha: mergeBase
  })
  return { event: 'changed', schemaPath, changes: diffSchemas(base, head) }
}

function gate(
  counts: Counts,
  failOn: FailOn,
  schemaPath: string
): string | undefined {
  const gated =
    failOn === 'breaking'
      ? { breaking: counts.breaking }
      : failOn === 'dangerous'
        ? { breaking: counts.breaking, dangerous: counts.dangerous }
        : {}
  const offending = Object.entries(gated).filter(([, n]) => n > 0)
  if (offending.length === 0) return undefined

  const total = offending.reduce((sum, [, n]) => sum + n, 0)
  const described = offending
    .map(([severity, n]) => `${n} ${severity}`)
    .join(' and ')
  const noun = total === 1 ? 'change' : 'changes'
  return `${described} ${noun} in \`${schemaPath}\` (fail-on: ${failOn}).`
}
