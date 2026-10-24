import { diffSchemas } from './diff/index.js'
import {
  FAIL_ON_VALUES,
  offendingChanges,
  type FailOn,
  type Gate
} from './gate.js'
import type { GitHubPort, StickyCommentResult } from './github.js'
import { countsOf, inventoryOf, type Counts, type Report } from './report.js'
import { render } from './render.js'
import { loadSchema, SchemaFileError, shortSha } from './schema-file.js'

export interface RunInputs {
  /** Path of the schema file in the repository. */
  schema: string
  /** Severity at or above which the step fails: `breaking`, `dangerous` or `never`. */
  failOn: string
  /** Name of the label that lets the gate pass for this pull request; empty turns it off. */
  acceptLabel: string
}

export interface PullRequest {
  number: number
  baseSha: string
  headSha: string
  /**
   * Why the workflow token cannot comment, when it cannot: the head is from a
   * fork, or Dependabot opened the pull request. Undefined when it can.
   */
  readOnlyToken?: 'fork' | 'dependabot'
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
  /** Notice annotations to emit, in this order. */
  notices: string[]
}

const READ_ONLY_NOTICES = {
  fork: 'This pull request comes from a fork, so Cambium cannot comment on it. The report is in the job summary.',
  dependabot:
    'This pull request was opened by Dependabot, whose token is read-only, so Cambium cannot comment on it. The report is in the job summary.'
} as const

/** Comments above this length are truncated; GitHub's limit is 65,536 characters. */
export const COMMENT_BUDGET = 60_000

export const PERMISSIONS_HINT = [
  'permissions:',
  '  contents: read',
  '  pull-requests: write'
].join('\n')

/**
 * The orchestrator: resolves the merge-base, reads the schema file at both
 * commits, diffs, reads the labels when the gate would fail, renders, writes
 * the summary, posts the sticky comment when it can, and applies the gate.
 */
export async function run({
  inputs,
  pullRequest,
  github,
  summaryUrl
}: RunOptions): Promise<RunOutcome> {
  const failOn = parseFailOn(inputs.failOn)
  if (!failOn) {
    return failed(
      `\`fail-on\` must be one of ${FAIL_ON_VALUES.join(', ')}; got "${inputs.failOn}".`
    )
  }

  const acceptLabel = inputs.acceptLabel.trim()
  if (/[,\n]/.test(acceptLabel)) {
    return failed(
      `\`accept-label\` takes one label name, without a comma or a newline; got "${inputs.acceptLabel}".`
    )
  }

  const schemaPath = inputs.schema
  if (schemaPath.includes('-->')) {
    return failed(`\`schema\` must not contain \`-->\`; got "${schemaPath}".`)
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
    if (error instanceof SchemaFileError) return failed(error.message)
    throw error
  }
  if (!report) {
    return failed(
      `\`${schemaPath}\` does not exist at the merge-base (${shortSha(mergeBase)}) ` +
        `or at the head (${shortSha(pullRequest.headSha)}). Check the \`schema\` input.`
    )
  }

  const counts = countsOf(report)
  const offending = offendingChanges(counts, failOn)

  // The labels are read live, and only when they could change the outcome.
  // A failed read renders as label-absent and fails the step after the report
  // is out, so it is never mistaken for an absent label.
  const gate: Gate = { failOn, accepted: false }
  let labelsFailure: string | undefined
  if (offending && acceptLabel) {
    gate.acceptLabel = acceptLabel
    try {
      const labels = await github.listLabels()
      if (labels === 'forbidden') {
        labelsFailure =
          "Could not read the pull request's labels: GitHub returned 403. " +
          "Add `pull-requests: read` or `issues: read` to the job's `permissions:` block."
      } else {
        gate.accepted = labels.some((name) => sameLabel(name, acceptLabel))
      }
    } catch (error) {
      labelsFailure = `Could not read the pull request's labels: ${messageOf(error)}`
    }
  }

  await github.writeSummary(render(report, { gate }))

  const outcome: RunOutcome = { outputs: counts, notices: [] }
  if (pullRequest.readOnlyToken) {
    outcome.notices.push(READ_ONLY_NOTICES[pullRequest.readOnlyToken])
  } else {
    const marker = stickyMarker(schemaPath)
    let result: StickyCommentResult
    try {
      result = await github.upsertStickyComment({
        marker,
        body: `${render(report, { budget: COMMENT_BUDGET, summaryUrl, gate })}\n${marker}`,
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

  if (labelsFailure) {
    outcome.failure = labelsFailure
    return outcome
  }

  if (!offending) return outcome
  const where = `${offending.phrase} in \`${schemaPath}\``
  if (gate.accepted) {
    outcome.notices.push(
      `${where} accepted for this pull request by the label \`${acceptLabel}\`.`
    )
  } else {
    outcome.failure = `${where} (fail-on: ${failOn}).`
  }
  return outcome
}

/** The hidden marker that makes the comment sticky, one per schema file. */
export function stickyMarker(schemaPath: string): string {
  return `<!-- cambium: schema=${schemaPath} -->`
}

function failed(failure: string): RunOutcome {
  return { failure, notices: [] }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function parseFailOn(value: string): FailOn | undefined {
  return FAIL_ON_VALUES.find((v) => v === value)
}

/** GitHub looks labels up case-insensitively and stores the case as typed, so the match ignores case. */
function sameLabel(name: string, acceptLabel: string): boolean {
  return name.trim().toLowerCase() === acceptLabel.toLowerCase()
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
