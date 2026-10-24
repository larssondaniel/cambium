import type { Change } from './diff/index.js'
import { gatedSeverities, offendingChanges, type Gate } from './gate.js'
import {
  countsOf,
  verdictOf,
  type Counts,
  type Report,
  type SchemaInventory
} from './report.js'

export interface RenderOptions {
  /**
   * Maximum length of the rendered body. Change lines are dropped from the
   * bottom until the body fits: safe first, then dangerous, never breaking.
   * Omit it to never truncate.
   */
  budget?: number
  /** Where the untruncated report lives, for the pointer that follows dropped lines. */
  summaryUrl?: string
  /**
   * The gate, for the gate line at the foot. Omit it, or configure no
   * acceptance label, and no gate line is rendered.
   */
  gate?: Gate
}

const REPO_URL = 'https://github.com/larssondaniel/cambium'
const FOOTER = `<sub>Cambium · [larssondaniel/cambium](${REPO_URL})</sub>`

/** Quoted text longer than this is cut and ended with an ellipsis. */
const QUOTE_LIMIT = 80

/**
 * Renders a report as markdown. The same function serves the PR comment
 * (with a budget) and the job summary (without one).
 */
export function render(report: Report, options: RenderOptions = {}): string {
  if (report.event !== 'changed')
    return renderWholeFileEvent(report, options.gate)

  const droppable = report.changes.filter(
    (c) => c.severity !== 'breaking'
  ).length
  const dropped = options.budget
    ? smallestFit(
        (n) => renderChanges(report, n, options).length <= options.budget!,
        droppable
      )
    : 0
  return renderChanges(report, dropped, options)
}

/** Smallest n in [0, max] for which `fits(n)` holds, or max when none does. */
function smallestFit(fits: (n: number) => boolean, max: number): number {
  let low = 0
  let high = max
  while (low < high) {
    const mid = Math.floor((low + high) / 2)
    if (fits(mid)) high = mid
    else low = mid + 1
  }
  return low
}

function renderChanges(
  report: Extract<Report, { event: 'changed' }>,
  dropped: number,
  options: RenderOptions
): string {
  const counts = countsOf(report)
  const title = `### ${verdictOf(report)}`

  if (report.changes.length === 0) {
    return [
      title,
      `\`${report.schemaPath}\` is the same schema at the merge-base and at the head.`,
      FOOTER
    ].join('\n\n')
  }

  const breaking = report.changes.filter((c) => c.severity === 'breaking')
  const dangerous = report.changes.filter((c) => c.severity === 'dangerous')
  const safe = report.changes.filter((c) => c.severity === 'safe')
  // Drop from the bottom: the end of the safe list first, then the end of the dangerous list.
  const safeShown = safe.slice(0, Math.max(0, safe.length - dropped))
  const dangerousShown = dangerous.slice(
    0,
    dangerous.length - Math.max(0, dropped - safe.length)
  )

  const blocks = [
    title,
    `${counts.breaking} breaking · ${counts.dangerous} dangerous · ${counts.safe} safe`
  ]
  if (breaking.length > 0) blocks.push(section('Breaking', breaking))
  if (dangerousShown.length > 0)
    blocks.push(section('Dangerous', dangerousShown))
  if (safeShown.length > 0) {
    const collapse = breaking.length > 0 || dangerous.length > 0
    blocks.push(
      collapse ? collapsed(counts.safe, safeShown) : section('Safe', safeShown)
    )
  }
  if (dropped > 0) blocks.push(omitted(dropped, options.summaryUrl))
  blocks.push(...gateLine(counts, options.gate), FOOTER)
  return blocks.join('\n\n')
}

function section(heading: string, changes: Change[]): string {
  return `#### ${heading}\n\n${list(changes)}`
}

function collapsed(count: number, changes: Change[]): string {
  const summary = `${count} safe ${count === 1 ? 'change' : 'changes'}`
  return `<details><summary>${summary}</summary>\n\n${list(changes)}\n\n</details>`
}

function list(changes: Change[]): string {
  return changes.map((change) => `- ${phrase(change)}`).join('\n')
}

function omitted(count: number, summaryUrl: string | undefined): string {
  const summary = summaryUrl ? `[job summary](${summaryUrl})` : 'job summary'
  const noun = count === 1 ? 'change' : 'changes'
  return `${count} more ${noun} not shown. See the ${summary} for the full report.`
}

/**
 * The gate line: one paragraph above the footer, only when the gate would
 * fail on the report and an acceptance label is configured. Before the
 * label it states the rule and names the label; after, it states what was
 * accepted. Zero or one element, so it splices into a block list.
 */
function gateLine(counts: Counts, gate: Gate | undefined): string[] {
  if (!gate?.acceptLabel) return []
  const offending = offendingChanges(counts, gate.failOn)
  if (!offending) return []
  const label = code(gate.acceptLabel)
  if (gate.accepted) {
    const verb = offending.total === 1 ? 'is' : 'are'
    return [
      `${offending.phrase} ${verb} accepted for this pull request by the label ${label}, so the check passes.`
    ]
  }
  const rule = gatedSeverities(gate.failOn).join(' and ')
  return [
    `This check fails on ${rule} changes. Adding the label ${label} accepts them for this pull request.`
  ]
}

function renderWholeFileEvent(
  report: Extract<Report, { event: 'new-schema' | 'schema-removed' }>,
  gate: Gate | undefined
): string {
  const title = `### ${verdictOf(report)}`
  const file = `\`${report.schemaPath}\``
  if (report.event === 'new-schema') {
    return [
      title,
      inventoryLine(report.inventory),
      `${file} is new: it does not exist at the merge-base.`,
      FOOTER
    ].join('\n\n')
  }
  return [
    title,
    '1 breaking · 0 dangerous · 0 safe',
    `${file} exists at the merge-base and is absent at the head.`,
    ...gateLine(countsOf(report), gate),
    FOOTER
  ].join('\n\n')
}

function inventoryLine(inventory: SchemaInventory): string {
  const parts = (
    [
      [inventory.types, 'type', 'types'],
      [inventory.interfaces, 'interface', 'interfaces'],
      [inventory.unions, 'union', 'unions'],
      [inventory.enums, 'enum', 'enums'],
      [inventory.inputTypes, 'input type', 'input types'],
      [inventory.scalars, 'scalar', 'scalars'],
      [inventory.directives, 'directive', 'directives']
    ] as const
  )
    .filter(([count]) => count > 0)
    .map(([count, one, many]) => `${count} ${count === 1 ? one : many}`)
  return parts.length > 0 ? parts.join(' · ') : 'No types'
}

/**
 * One line per change: the schema path in code, a plain verb, before and
 * after when a value changed. Dangerous lines, and only those, end with a
 * fixed reason clause after a middle dot.
 */
export function phrase(change: Change): string {
  const line = describe(change)
  const reason = change.severity === 'dangerous' ? reasonFor(change) : undefined
  return reason ? `${line} · ${reason}` : line
}

/**
 * Why a dangerous change is dangerous, in the reviewer's terms: what an
 * existing client does with it. One clause per reason, never per kind.
 */
export function reasonFor(change: Change): string | undefined {
  switch (change.kind) {
    case 'VALUE_ADDED_TO_ENUM':
      return `clients that switch over ${code(change.path.split('.')[0])} may not handle it`
    case 'TYPE_ADDED_TO_UNION':
      return `clients that switch over ${code(change.path)} may not handle it`
    case 'OPTIONAL_ARG_ADDED':
    case 'OPTIONAL_INPUT_FIELD_ADDED':
      return 'existing calls now take its default'
    case 'IMPLEMENTED_INTERFACE_ADDED':
      return `fragments on ${code(change.subject)} now match this type`
    case 'ARG_DEFAULT_VALUE_CHANGE':
    case 'INPUT_FIELD_DEFAULT_VALUE_CHANGE':
      return 'callers that omit it now get the new value'
    default:
      return undefined
  }
}

function describe(change: Change): string {
  const path = code(change.path)
  const subject = code(change.subject ?? '')
  switch (change.kind) {
    // Types
    case 'TYPE_REMOVED':
      return change.subject === 'built-in scalar'
        ? `${path} built-in scalar removed, no longer referenced`
        : `${path} ${change.subject} removed`
    case 'TYPE_ADDED':
      return change.subject === 'built-in scalar'
        ? `${path} built-in scalar added, now referenced`
        : `${path} ${change.subject} added`
    case 'TYPE_CHANGED_KIND':
      return `${path} changed from ${change.before} type to ${change.after} type`
    case 'TYPE_REMOVED_FROM_UNION':
      return `${path} union member ${subject} removed`
    case 'TYPE_ADDED_TO_UNION':
      return `${path} union member ${subject} added`
    case 'IMPLEMENTED_INTERFACE_REMOVED':
      return `${path} no longer implements ${subject}`
    case 'IMPLEMENTED_INTERFACE_ADDED':
      return `${path} now implements ${subject}`
    // Enum values
    case 'VALUE_REMOVED_FROM_ENUM':
      return `${path} removed from enum`
    case 'VALUE_ADDED_TO_ENUM':
      return `${path} added to enum`
    // Fields, input fields and arguments
    case 'FIELD_REMOVED':
    case 'ARG_REMOVED':
    case 'DIRECTIVE_ARG_REMOVED':
      return `${path} removed`
    case 'FIELD_ADDED':
      return `${path} added`
    case 'REQUIRED_INPUT_FIELD_ADDED':
      return `${path} required input field added`
    case 'OPTIONAL_INPUT_FIELD_ADDED':
      return `${path} optional input field added`
    case 'REQUIRED_ARG_ADDED':
    case 'REQUIRED_DIRECTIVE_ARG_ADDED':
      return `${path} required argument added`
    case 'OPTIONAL_ARG_ADDED':
    case 'OPTIONAL_DIRECTIVE_ARG_ADDED':
      return `${path} optional argument added`
    case 'FIELD_CHANGED_KIND':
    case 'FIELD_CHANGED_KIND_SAFE':
    case 'ARG_CHANGED_KIND':
    case 'ARG_CHANGED_KIND_SAFE':
      return `${path} changed type from ${code(change.before)} to ${code(change.after)}`
    // Default values
    case 'ARG_DEFAULT_VALUE_CHANGE':
    case 'INPUT_FIELD_DEFAULT_VALUE_CHANGE':
      if (change.after === undefined)
        return `${path} default ${code(change.before)} removed`
      return `${path} default changed from ${code(change.before)} to ${code(change.after)}`
    case 'ARG_DEFAULT_VALUE_ADDED':
    case 'INPUT_FIELD_DEFAULT_VALUE_ADDED':
      return `${path} default ${code(change.after)} added`
    // Directives
    case 'DIRECTIVE_REMOVED':
      return `${path} directive removed`
    case 'DIRECTIVE_ADDED':
      return `${path} directive added`
    case 'DIRECTIVE_REPEATABLE_REMOVED':
      return `${path} no longer repeatable`
    case 'DIRECTIVE_REPEATABLE_ADDED':
      return `${path} now repeatable`
    case 'DIRECTIVE_LOCATION_REMOVED':
      return `${path} no longer allowed on ${subject}`
    case 'DIRECTIVE_LOCATION_ADDED':
      return `${path} now allowed on ${subject}`
    // Text
    case 'DESCRIPTION_CHANGED':
      if (change.after === undefined)
        return `${path} description ${quote(change.before ?? '')} removed`
      if (change.before === undefined)
        return `${path} description added: ${quote(change.after)}`
      return `${path} description changed from ${quote(change.before)} to ${quote(change.after)}`
    case 'DEPRECATION_ADDED':
      return `${path} deprecated: ${quote(change.text ?? '')}`
    case 'DEPRECATION_REMOVED':
      return `${path} no longer deprecated`
    case 'DEPRECATION_REASON_CHANGED':
      return `${path} deprecation reason changed from ${quote(change.before ?? '')} to ${quote(change.after ?? '')}`
    case 'UNRECOGNIZED':
      return escapeMarkdown((change.description ?? '').replace(/\.$/, ''))
  }
}

/**
 * Wraps text in a code span that survives any content: the fence is one
 * backtick longer than the longest run inside, and content that starts or
 * ends with a backtick is padded with spaces, as GitHub-flavoured markdown
 * requires.
 */
function code(text: string | undefined): string {
  const content = text ?? ''
  const longestRun = Math.max(
    0,
    ...[...content.matchAll(/`+/g)].map((match) => match[0].length)
  )
  const fence = '`'.repeat(longestRun + 1)
  const padded =
    longestRun > 0 && (content.startsWith('`') || content.endsWith('`'))
      ? ` ${content} `
      : content
  return `${fence}${padded}${fence}`
}

/** Inlines text on one line, cut with an ellipsis when long, with markup neutralised. */
function quote(text: string): string {
  const oneLine = text.replace(/\s+/g, ' ').trim()
  const cut =
    oneLine.length > QUOTE_LIMIT
      ? `${oneLine.slice(0, QUOTE_LIMIT - 1).replace(/[\s,;:]+$/, '')}…`
      : oneLine
  return `"${escapeMarkdown(cut)}"`
}

/**
 * Makes schema-authored text inert in markdown: punctuation that could open
 * markup, a link or an image is backslash-escaped, and an `@` gets a
 * zero-width space after it so GitHub does not turn it into a mention that
 * pings someone on every comment edit. Backticks are left alone: at worst
 * they open a code span, which cannot reach outside the line.
 */
function escapeMarkdown(text: string): string {
  return text
    .replace(/[\\*_~<>[\]()!|#]/g, (char) => `\\${char}`)
    .replace(/@/g, '@\u200b')
}
