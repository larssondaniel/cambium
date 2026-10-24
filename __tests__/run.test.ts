/**
 * The run seam: the orchestrator driven from the outside with an in-memory
 * fake of the GitHub port and fixture schema pairs. Assertions are what a
 * user would observe: the comment body, the summary body, the outputs, the
 * failure message and the notices.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from '@jest/globals'
import {
  BREAKING_KINDS,
  DANGEROUS_KINDS,
  SAFE_KINDS,
  type ChangeKindFixture
} from '../__fixtures__/change-kinds.js'
import { FakeGitHub } from '../__fixtures__/github.js'
import { run, stickyMarker, type RunOutcome } from '../src/run.js'

const SCHEMA_PATH = 'schema.graphql'
const BASE_SHA = 'tip0000000000000000000000000000000000000'
const HEAD_SHA = 'head000000000000000000000000000000000000'

function fixture(name: string): string {
  return readFileSync(
    new URL(`../__fixtures__/schemas/${name}`, import.meta.url),
    'utf8'
  )
}

interface Scenario {
  base?: string
  head?: string
  failOn?: string
  /** The `accept-label` input; the action's default when omitted. */
  acceptLabel?: string
  /** Names of the labels on the pull request. */
  labels?: string[]
  labelsForbidden?: boolean
  labelsError?: Error
  readOnlyToken?: 'fork' | 'dependabot'
  existingComment?: string
  forbidden?: 'read' | 'write'
  commentError?: Error
  schema?: string
}

const DEFAULT_ACCEPT_LABEL = 'schema-change-accepted'

async function cambium(
  scenario: Scenario
): Promise<{ outcome: RunOutcome; github: FakeGitHub }> {
  const github = new FakeGitHub()
  const schema = scenario.schema ?? SCHEMA_PATH
  if (scenario.base !== undefined)
    github.file(github.mergeBase, schema, scenario.base)
  if (scenario.head !== undefined) github.file(HEAD_SHA, schema, scenario.head)
  github.existingComment = scenario.existingComment
  github.forbidden = scenario.forbidden ?? false
  github.commentError = scenario.commentError
  github.labels = scenario.labels ?? []
  github.labelsForbidden = scenario.labelsForbidden ?? false
  github.labelsError = scenario.labelsError
  const outcome = await run({
    inputs: {
      schema,
      failOn: scenario.failOn ?? 'breaking',
      acceptLabel: scenario.acceptLabel ?? DEFAULT_ACCEPT_LABEL
    },
    pullRequest: {
      number: 7,
      baseSha: BASE_SHA,
      headSha: HEAD_SHA,
      readOnlyToken: scenario.readOnlyToken
    },
    github,
    summaryUrl: 'https://github.com/acme/api/actions/runs/1'
  })
  return { outcome, github }
}

/** The visible part of a comment body, without the sticky marker line. */
function visible(body: string | undefined): string | undefined {
  return body?.replace(`\n${stickyMarker(SCHEMA_PATH)}`, '')
}

const example = {
  base: fixture('example/base.graphql'),
  head: fixture('example/head.graphql')
}
/** One dangerous change and nothing else. */
const dangerousOnly = {
  base: 'enum OrderStatus { PAID }',
  head: 'enum OrderStatus { PAID REFUNDED }'
}

const FORK_NOTICE =
  'This pull request comes from a fork, so Cambium cannot comment on it. The report is in the job summary.'
const DEPENDABOT_NOTICE =
  'This pull request was opened by Dependabot, whose token is read-only, so Cambium cannot comment on it. The report is in the job summary.'
const BEFORE_LINE =
  'This check fails on breaking changes. Adding the label `schema-change-accepted` accepts them for this pull request.'
const AFTER_LINE =
  '1 breaking change is accepted for this pull request by the label `schema-change-accepted`, so the check passes.'
const ACCEPTANCE_NOTICE =
  '1 breaking change in `schema.graphql` accepted for this pull request by the label `schema-change-accepted`.'
const V1_FAILURE = '1 breaking change in `schema.graphql` (fail-on: breaking).'

/** True when the body carries a gate line of either kind. */
function hasGateLine(body: string | undefined): boolean {
  return /This check fails on|accepted for this pull request/.test(body ?? '')
}
const safeOnly = {
  base: fixture('safe-only/base.graphql'),
  head: fixture('safe-only/head.graphql')
}

describe('a pull request that changes the schema', () => {
  it('posts the comment: verdict, counts, then sections by severity', async () => {
    const { outcome, github } = await cambium(example)

    expect(visible(github.comment?.body)).toMatchSnapshot()
    expect(github.comment?.result).toBe('created')
    expect(outcome.outputs).toEqual({ breaking: 1, dangerous: 2, safe: 5 })
  })

  it('writes the same report to the job summary', async () => {
    const { github } = await cambium(example)

    expect(github.summary).toBe(visible(github.comment?.body))
  })

  it('reads the base schema at the merge-base, not at the target branch tip', async () => {
    const { github } = await cambium(example)

    expect(github.mergeBaseRequest).toEqual({
      baseSha: BASE_SHA,
      headSha: HEAD_SHA
    })
  })

  it('expands the safe section when safe changes are all there is', async () => {
    const { outcome, github } = await cambium(safeOnly)

    expect(visible(github.comment?.body)).toMatchSnapshot()
    expect(outcome.outputs).toEqual({ breaking: 0, dangerous: 0, safe: 3 })
    expect(outcome.failure).toBeUndefined()
  })

  it('ends the comment with a marker that names the schema file', async () => {
    const { github } = await cambium({
      ...example,
      schema: 'services/billing/schema.graphql'
    })

    expect(
      github.comment?.body.endsWith(
        '<!-- cambium: schema=services/billing/schema.graphql -->'
      )
    ).toBe(true)
  })
})

describe('the sticky comment', () => {
  it('is updated in place when one exists', async () => {
    const { github } = await cambium({
      ...example,
      existingComment: `old body\n${stickyMarker(SCHEMA_PATH)}`
    })

    expect(github.comment?.result).toBe('updated')
  })

  it('is created when none exists', async () => {
    const { github } = await cambium(example)

    expect(github.comment?.result).toBe('created')
  })

  it("belongs to one schema file: another file's comment is not reused", async () => {
    const { github } = await cambium({
      ...example,
      existingComment: `other\n${stickyMarker('other.graphql')}`
    })

    expect(github.comment?.result).toBe('created')
  })
})

describe('a pull request that leaves the schema unchanged', () => {
  const unchanged = { base: example.base, head: example.base }

  it('updates an existing comment to "No schema changes"', async () => {
    const { outcome, github } = await cambium({
      ...unchanged,
      existingComment: `old\n${stickyMarker(SCHEMA_PATH)}`
    })

    expect(visible(github.comment?.body)).toMatchSnapshot()
    expect(github.comment?.result).toBe('updated')
    expect(outcome.outputs).toEqual({ breaking: 0, dangerous: 0, safe: 0 })
    expect(outcome.failure).toBeUndefined()
  })

  it('posts nothing when no comment exists, but still writes the summary', async () => {
    const { github } = await cambium(unchanged)

    expect(github.comment).toBeUndefined()
    expect(github.summary).toContain('### No schema changes')
  })

  it('treats a text-only edit, such as reformatting, as no schema change', async () => {
    const { outcome } = await cambium({
      base: example.base,
      head: `# comment\n${example.base.replace(/\n/g, '\n\n')}`
    })

    expect(outcome.outputs).toEqual({ breaking: 0, dangerous: 0, safe: 0 })
  })
})

describe('schema file format', () => {
  it('reads introspection JSON with a bare __schema', async () => {
    const sdl = await cambium(example)
    const json = await cambium({
      base: example.base,
      head: fixture('introspection/head.json')
    })

    expect(json.github.comment?.body).toBe(sdl.github.comment?.body)
  })

  it('reads introspection JSON wrapped in data', async () => {
    const sdl = await cambium(example)
    const json = await cambium({
      base: example.base,
      head: fixture('introspection/head-data.json')
    })

    expect(json.github.comment?.body).toBe(sdl.github.comment?.body)
  })

  it('detects the format on each side independently', async () => {
    const { outcome } = await cambium({
      base: fixture('introspection/head.json'),
      head: example.head
    })

    expect(outcome.outputs).toEqual({ breaking: 0, dangerous: 0, safe: 0 })
  })
})

describe('an absent or unparsable schema file', () => {
  it('fails when the file is absent at both commits, naming the path and both shas', async () => {
    const { outcome, github } = await cambium({})

    expect(outcome.failure).toBe(
      '`schema.graphql` does not exist at the merge-base (mergeba) or at the head (head000). Check the `schema` input.'
    )
    expect(outcome.outputs).toBeUndefined()
    expect(github.summary).toBeUndefined()
  })

  it('reports a new schema with type counts when the file is absent at the merge-base', async () => {
    const { outcome, github } = await cambium({ head: example.head })

    expect(visible(github.comment?.body)).toMatchSnapshot()
    expect(outcome.outputs).toEqual({ breaking: 0, dangerous: 0, safe: 6 })
    expect(outcome.failure).toBeUndefined()
  })

  it('reports a removed schema as breaking when the file is absent at the head', async () => {
    const { outcome, github } = await cambium({ base: example.base })

    expect(visible(github.comment?.body)).toMatchSnapshot()
    expect(outcome.outputs).toEqual({ breaking: 1, dangerous: 0, safe: 0 })
    expect(outcome.failure).toBe(
      '1 breaking change in `schema.graphql` (fail-on: breaking).'
    )
  })

  it('fails with the parser error and the commit when the head file is unparsable', async () => {
    const { outcome } = await cambium({
      base: example.base,
      head: 'type Query { a: String'
    })

    expect(outcome.failure).toBe(
      'Could not parse the head schema, `schema.graphql` at head000: Syntax Error: Expected Name, found <EOF>.'
    )
  })

  it('fails with the parser error and the commit when the merge-base file is unparsable', async () => {
    const { outcome } = await cambium({
      base: 'type Query { a: Missing }',
      head: example.head
    })

    expect(outcome.failure).toBe(
      'Could not parse the base schema, `schema.graphql` at mergeba: Unknown type "Missing".'
    )
  })

  it('fails when introspection JSON has no __schema', async () => {
    const { outcome } = await cambium({
      base: example.base,
      head: '{ "types": [] }'
    })

    expect(outcome.failure).toBe(
      'Could not parse the head schema, `schema.graphql` at head000: Introspection JSON has no `__schema` key, neither at the top level nor under `data`'
    )
  })
})

describe('the gate', () => {
  it('fails on breaking changes by default', async () => {
    const { outcome } = await cambium(example)

    expect(outcome.failure).toBe(
      '1 breaking change in `schema.graphql` (fail-on: breaking).'
    )
  })

  it('counts dangerous changes too when fail-on is dangerous', async () => {
    const { outcome } = await cambium({ ...example, failOn: 'dangerous' })

    expect(outcome.failure).toBe(
      '1 breaking and 2 dangerous changes in `schema.graphql` (fail-on: dangerous).'
    )
  })

  it('never fails when fail-on is never', async () => {
    const { outcome } = await cambium({ ...example, failOn: 'never' })

    expect(outcome.failure).toBeUndefined()
    expect(outcome.outputs).toEqual({ breaking: 1, dangerous: 2, safe: 5 })
  })

  it('lets dangerous changes through when fail-on is breaking', async () => {
    expect((await cambium(dangerousOnly)).outcome.failure).toBeUndefined()
    expect(
      (await cambium({ ...dangerousOnly, failOn: 'dangerous' })).outcome.failure
    ).toBe('1 dangerous change in `schema.graphql` (fail-on: dangerous).')
  })

  it('rejects an unknown fail-on value before touching GitHub', async () => {
    const { outcome, github } = await cambium({ ...example, failOn: 'warn' })

    expect(outcome.failure).toBe(
      '`fail-on` must be one of breaking, dangerous, never; got "warn".'
    )
    expect(github.mergeBaseRequest).toBeUndefined()
  })
})

describe('a pull request from a fork', () => {
  it('skips the comment, writes the summary and says so in a notice', async () => {
    const { outcome, github } = await cambium({
      ...example,
      readOnlyToken: 'fork'
    })

    expect(github.comment).toBeUndefined()
    expect(github.summary).toContain('### Breaking schema change')
    expect(outcome.notices).toEqual([FORK_NOTICE])
  })

  it('still applies the gate and sets outputs', async () => {
    const { outcome } = await cambium({ ...example, readOnlyToken: 'fork' })

    expect(outcome.failure).toBe(
      '1 breaking change in `schema.graphql` (fail-on: breaking).'
    )
    expect(outcome.outputs).toEqual({ breaking: 1, dangerous: 2, safe: 5 })
  })
})

describe('a pull request opened by Dependabot', () => {
  it('is treated like a fork: summary and gate, a notice, no comment', async () => {
    const { outcome, github } = await cambium({
      ...example,
      readOnlyToken: 'dependabot'
    })

    expect(github.comment).toBeUndefined()
    expect(github.summary).toContain('### Breaking schema change')
    expect(outcome.notices).toEqual([DEPENDABOT_NOTICE])
    expect(outcome.failure).toBe(
      '1 breaking change in `schema.graphql` (fail-on: breaking).'
    )
    expect(outcome.outputs).toEqual({ breaking: 1, dangerous: 2, safe: 5 })
  })
})

describe('the acceptance label', () => {
  const labelled = { ...example, labels: ['schema-change-accepted'] }

  it('lets breaking changes through with a notice, and the comment says so', async () => {
    const { outcome, github } = await cambium(labelled)

    expect(outcome.failure).toBeUndefined()
    expect(outcome.notices).toEqual([ACCEPTANCE_NOTICE])
    expect(visible(github.comment?.body)).toMatchSnapshot()
    expect(github.comment?.body).toContain(`\n\n${AFTER_LINE}\n\n<sub>`)
    expect(github.summary).toContain(`\n\n${AFTER_LINE}\n\n<sub>`)
    expect(outcome.outputs).toEqual({ breaking: 1, dangerous: 2, safe: 5 })
  })

  it('counts what it accepted the way the failure message does', async () => {
    const { outcome, github } = await cambium({
      ...labelled,
      failOn: 'dangerous'
    })

    expect(outcome.failure).toBeUndefined()
    expect(outcome.notices).toEqual([
      '1 breaking and 2 dangerous changes in `schema.graphql` accepted for this pull request by the label `schema-change-accepted`.'
    ])
    expect(github.comment?.body).toContain(
      '1 breaking and 2 dangerous changes are accepted for this pull request by the label `schema-change-accepted`, so the check passes.'
    )
  })

  it('accepts dangerous changes under fail-on: dangerous, in "dangerous" wording', async () => {
    const { outcome, github } = await cambium({
      ...dangerousOnly,
      labels: ['schema-change-accepted'],
      failOn: 'dangerous'
    })

    expect(outcome.failure).toBeUndefined()
    expect(outcome.notices).toEqual([
      '1 dangerous change in `schema.graphql` accepted for this pull request by the label `schema-change-accepted`.'
    ])
    expect(github.comment?.body).toContain(
      '1 dangerous change is accepted for this pull request by the label `schema-change-accepted`, so the check passes.'
    )
  })

  it('is inert when the gate would pass anyway: no gate line, no notice, no labels read', async () => {
    const dangerous = await cambium({
      ...dangerousOnly,
      labels: ['schema-change-accepted']
    })
    expect(hasGateLine(dangerous.github.comment?.body)).toBe(false)
    expect(dangerous.outcome.notices).toEqual([])
    expect(dangerous.github.labelsRead).toBe(false)

    const safe = await cambium({
      ...safeOnly,
      labels: ['schema-change-accepted']
    })
    expect(hasGateLine(safe.github.comment?.body)).toBe(false)
    expect(safe.outcome.notices).toEqual([])
    expect(safe.github.labelsRead).toBe(false)
  })

  it('names the label in the comment when it is absent, and fails as before', async () => {
    const { outcome, github } = await cambium(example)

    expect(outcome.failure).toBe(V1_FAILURE)
    expect(outcome.notices).toEqual([])
    expect(github.comment?.body).toContain(`\n\n${BEFORE_LINE}\n\n<sub>`)
    expect(github.summary).toContain(`\n\n${BEFORE_LINE}\n\n<sub>`)
    expect(github.labelsRead).toBe(true)
  })

  it('states the rule under fail-on: dangerous whatever the counts', async () => {
    const { github } = await cambium({ ...dangerousOnly, failOn: 'dangerous' })

    expect(github.comment?.body).toContain(
      'This check fails on breaking and dangerous changes. Adding the label `schema-change-accepted` accepts them for this pull request.'
    )
  })

  it('is off when accept-label is empty: the comment is exactly v1 and no labels are read', async () => {
    const { outcome, github } = await cambium({ ...labelled, acceptLabel: '' })

    expect(outcome.failure).toBe(V1_FAILURE)
    expect(outcome.notices).toEqual([])
    expect(hasGateLine(github.comment?.body)).toBe(false)
    expect(github.labelsRead).toBe(false)
    expect(visible(github.comment?.body)).toMatchSnapshot()

    const blank = await cambium({ ...labelled, acceptLabel: '  \t ' })
    expect(blank.github.comment?.body).toBe(github.comment?.body)
    expect(blank.github.labelsRead).toBe(false)
  })

  it('matches the configured name trimmed and regardless of case', async () => {
    const { outcome, github } = await cambium({
      ...labelled,
      acceptLabel: '  Schema-Change-Accepted '
    })

    expect(outcome.failure).toBeUndefined()
    expect(outcome.notices).toEqual([
      '1 breaking change in `schema.graphql` accepted for this pull request by the label `Schema-Change-Accepted`.'
    ])
    expect(github.comment?.body).toContain(
      'by the label `Schema-Change-Accepted`'
    )
  })

  it("matches the pull request's label regardless of its case too", async () => {
    const { outcome } = await cambium({
      ...example,
      labels: ['bug', 'SCHEMA-CHANGE-ACCEPTED']
    })

    expect(outcome.failure).toBeUndefined()
  })

  it('names a custom label, as a team coming from GraphQL Inspector would use', async () => {
    const absent = await cambium({
      ...example,
      acceptLabel: 'approved-breaking-change'
    })
    expect(absent.github.comment?.body).toContain(
      'This check fails on breaking changes. Adding the label `approved-breaking-change` accepts them for this pull request.'
    )

    const present = await cambium({
      ...example,
      acceptLabel: 'approved-breaking-change',
      labels: ['approved-breaking-change']
    })
    expect(present.outcome.failure).toBeUndefined()
    expect(present.github.comment?.body).toContain(
      '1 breaking change is accepted for this pull request by the label `approved-breaking-change`, so the check passes.'
    )
  })

  it('renders a label name with a backtick through the code-span helper', async () => {
    const { github } = await cambium({ ...example, acceptLabel: 'ok`ish' })

    expect(github.comment?.body).toContain(
      'Adding the label ``ok`ish`` accepts'
    )
  })

  it('rejects a value with a comma or a newline before touching GitHub', async () => {
    const comma = await cambium({
      ...example,
      acceptLabel: 'accepted, approved'
    })
    expect(comma.outcome.failure).toBe(
      '`accept-label` takes one label name, without a comma or a newline; got "accepted, approved".'
    )
    expect(comma.outcome.outputs).toBeUndefined()
    expect(comma.github.mergeBaseRequest).toBeUndefined()

    const newline = await cambium({
      ...example,
      acceptLabel: 'accepted\napproved'
    })
    expect(newline.outcome.failure).toContain(
      '`accept-label` takes one label name'
    )
    expect(newline.github.mergeBaseRequest).toBeUndefined()
  })

  it('never fails under fail-on: never, so there is no gate line and no labels read', async () => {
    for (const labels of [['schema-change-accepted'], []]) {
      const { outcome, github } = await cambium({
        ...example,
        failOn: 'never',
        labels
      })

      expect(outcome.failure).toBeUndefined()
      expect(outcome.notices).toEqual([])
      expect(hasGateLine(github.comment?.body)).toBe(false)
      expect(github.labelsRead).toBe(false)
    }
  })

  it('has nothing to say about a new schema', async () => {
    const { github } = await cambium({
      head: example.head,
      labels: ['schema-change-accepted']
    })

    expect(hasGateLine(github.comment?.body)).toBe(false)
    expect(github.labelsRead).toBe(false)
  })

  it('accepts a removed schema, which counts as one breaking change', async () => {
    const { outcome, github } = await cambium({
      base: example.base,
      labels: ['schema-change-accepted']
    })

    expect(outcome.failure).toBeUndefined()
    expect(outcome.notices).toEqual([ACCEPTANCE_NOTICE])
    expect(visible(github.comment?.body)).toMatchSnapshot()
    expect(github.comment?.body).toContain(`\n\n${AFTER_LINE}\n\n<sub>`)
  })

  describe('on a pull request without a comment', () => {
    it('passes a labelled fork pull request: summary with the after sentence, both notices, read-only first', async () => {
      const { outcome, github } = await cambium({
        ...labelled,
        readOnlyToken: 'fork'
      })

      expect(github.comment).toBeUndefined()
      expect(github.summary).toContain(`\n\n${AFTER_LINE}\n\n<sub>`)
      expect(outcome.notices).toEqual([FORK_NOTICE, ACCEPTANCE_NOTICE])
      expect(outcome.failure).toBeUndefined()
      expect(outcome.outputs).toEqual({ breaking: 1, dangerous: 2, safe: 5 })
    })

    it('names the label in the summary of an unlabelled fork pull request, and fails as before', async () => {
      const { outcome, github } = await cambium({
        ...example,
        readOnlyToken: 'fork'
      })

      expect(github.comment).toBeUndefined()
      expect(github.summary).toContain(`\n\n${BEFORE_LINE}\n\n<sub>`)
      expect(outcome.notices).toEqual([FORK_NOTICE])
      expect(outcome.failure).toBe(V1_FAILURE)
    })

    it('passes a labelled Dependabot pull request with both notices', async () => {
      const { outcome } = await cambium({
        ...labelled,
        readOnlyToken: 'dependabot'
      })

      expect(outcome.notices).toEqual([DEPENDABOT_NOTICE, ACCEPTANCE_NOTICE])
      expect(outcome.failure).toBeUndefined()
    })
  })

  describe('when the labels cannot be read', () => {
    it('reports as if the label were absent, then fails with the read error rather than the gate', async () => {
      const { outcome, github } = await cambium({
        ...labelled,
        labelsError: new Error('Server Error (502)')
      })

      expect(github.summary).toContain(`\n\n${BEFORE_LINE}\n\n<sub>`)
      expect(github.comment?.body).toContain(`\n\n${BEFORE_LINE}\n\n<sub>`)
      expect(outcome.failure).toBe(
        "Could not read the pull request's labels: Server Error (502)"
      )
      expect(outcome.notices).toEqual([])
      expect(outcome.outputs).toEqual({ breaking: 1, dangerous: 2, safe: 5 })
    })

    it('names the permission to add when GitHub returned 403', async () => {
      const { outcome, github } = await cambium({
        ...labelled,
        labelsForbidden: true
      })

      expect(outcome.failure).toBe(
        "Could not read the pull request's labels: GitHub returned 403. Add `pull-requests: read` or `issues: read` to the job's `permissions:` block."
      )
      expect(github.comment?.body).toContain(`\n\n${BEFORE_LINE}\n\n<sub>`)
    })
  })

  it('never reaches the gate when the comment is forbidden', async () => {
    const { outcome } = await cambium({ ...labelled, forbidden: 'write' })

    expect(outcome.failure).toMatch(
      /^Could not comment on the pull request: GitHub returned 403\./
    )
    expect(outcome.notices).toEqual([])
    expect(outcome.outputs).toEqual({ breaking: 1, dangerous: 2, safe: 5 })
  })
})

describe('backticks in quoted text', () => {
  it('render a balanced pair as a code span and leave an unbalanced one harmless', async () => {
    const { github } = await cambium({
      base: 'type User { a: String b: String }',
      head: 'type User { a: String @deprecated(reason: "Use `User.b`") b: String @deprecated(reason: "Stray ` here") }',
      failOn: 'never'
    })

    expect(github.summary).toContain(
      '- `User.a` deprecated: "Use `User.b`"\n- `User.b` deprecated: "Stray ` here"\n\n<sub>Cambium'
    )
  })
})

describe('a same-repo pull request whose token cannot comment', () => {
  const permissionsFailure =
    "Could not comment on the pull request: GitHub returned 403. Add these lines to the job's `permissions:` block:\n\n" +
    'permissions:\n  contents: read\n  pull-requests: write'

  it('fails with the permissions block to add when the write is forbidden, after writing the summary and outputs', async () => {
    const { outcome, github } = await cambium({
      ...safeOnly,
      forbidden: 'write'
    })

    expect(outcome.failure).toBe(permissionsFailure)
    expect(github.summary).toContain('### Schema changed, nothing breaking')
    expect(outcome.outputs).toEqual({ breaking: 0, dangerous: 0, safe: 3 })
  })

  it('fails the same way when even listing the comments is forbidden, as on a private repository', async () => {
    const { outcome, github } = await cambium({
      ...safeOnly,
      forbidden: 'read'
    })

    expect(outcome.failure).toBe(permissionsFailure)
    expect(github.summary).toContain('### Schema changed, nothing breaking')
    expect(outcome.outputs).toEqual({ breaking: 0, dangerous: 0, safe: 3 })
  })

  it('keeps the outputs when the comment call throws', async () => {
    const { outcome, github } = await cambium({
      ...example,
      commentError: new Error('Server Error (502)')
    })

    expect(outcome.outputs).toEqual({ breaking: 1, dangerous: 2, safe: 5 })
    expect(outcome.failure).toBe(
      'Could not comment on the pull request: Server Error (502)'
    )
    expect(github.summary).toContain('### Breaking schema change')
  })
})

describe('schema text that looks like markdown', () => {
  const base = `
    type Query {
      ping: String
      search(q: String = "plain"): String
    }`
  const head = `
    type Query {
      "Ping @org/team, see </details> and ![x](https://e/x.png) | col [here](https://e)"
      ping: String
      search(q: String = "a\`b"): String
    }`

  it('is shown as text, never as markup, mentions or images', async () => {
    const { github } = await cambium({ base, head, failOn: 'never' })

    expect(github.summary).toContain(
      '- `Query.ping` description added: "Ping @\u200borg/team, see \\</details\\> and \\!\\[x\\]\\(https://e/x.png\\) \\| col \\[here\\]\\(https://e\\)"'
    )
    expect(github.summary).not.toContain('see </details>')
    expect(github.summary).not.toContain('@org')
  })

  it('keeps a default value with a backtick inside one code span', async () => {
    const { github } = await cambium({ base, head, failOn: 'never' })

    expect(github.summary).toContain(
      '- `Query.search(q:)` default changed from `"plain"` to ``"a`b"``'
    )
  })
})

describe('an element that is born deprecated', () => {
  it('is one added line, not an added line plus a deprecation line', async () => {
    const field = await cambium({
      base: 'type User { id: ID! }',
      head: 'type User { id: ID! old: String @deprecated(reason: "Use `id`") }',
      failOn: 'never'
    })
    expect(field.github.summary).toContain('- `User.old` added')
    expect(field.github.summary).not.toContain('deprecated')
    expect(field.outcome.outputs).toEqual({
      breaking: 0,
      dangerous: 0,
      safe: 1
    })

    const value = await cambium({
      base: 'enum Role { ADMIN }',
      head: 'enum Role { ADMIN GUEST @deprecated }',
      failOn: 'never'
    })
    expect(value.github.summary).toContain('- `Role.GUEST` added to enum')
    expect(value.outcome.outputs).toEqual({
      breaking: 0,
      dangerous: 1,
      safe: 0
    })

    const type = await cambium({
      base: 'type Query { ok: Boolean }',
      head: 'type Query { ok: Boolean } type Legacy { a: String @deprecated, b: String @deprecated }',
      failOn: 'never'
    })
    expect(type.github.summary).toContain('- `Legacy` type added')
    expect(type.outcome.outputs).toEqual({ breaking: 0, dangerous: 0, safe: 1 })
  })
})

describe('a directive whose arguments both change description', () => {
  it('gets one line per argument', async () => {
    const { github, outcome } = await cambium({
      base: 'type Query { ok: Boolean } directive @auth(role: String, scope: String) on FIELD_DEFINITION',
      head: 'type Query { ok: Boolean } directive @auth("Role name" role: String, "Scope name" scope: String) on FIELD_DEFINITION',
      failOn: 'never'
    })

    expect(github.summary).toContain(
      '- `@auth(role:)` description added: "Role name"'
    )
    expect(github.summary).toContain(
      '- `@auth(scope:)` description added: "Scope name"'
    )
    expect(outcome.outputs).toEqual({ breaking: 0, dangerous: 0, safe: 2 })
  })
})

describe('the schema input', () => {
  it('rejects a path that could close the sticky marker', async () => {
    const { outcome, github } = await cambium({
      ...example,
      schema: 'a-->b.graphql'
    })

    expect(outcome.failure).toBe(
      '`schema` must not contain `-->`; got "a-->b.graphql".'
    )
    expect(github.mergeBaseRequest).toBeUndefined()
  })
})

describe.each([
  ['breaking', BREAKING_KINDS],
  ['dangerous', DANGEROUS_KINDS],
  ['safe', SAFE_KINDS]
])(
  'every %s change kind renders as one line',
  (_severity, kinds: ChangeKindFixture[]) => {
    it.each(kinds)('$kind', async ({ base, head, line, counts }) => {
      const { outcome, github } = await cambium({ base, head, failOn: 'never' })

      expect(github.summary).toContain(`- ${line}`)
      expect(outcome.outputs).toEqual({
        breaking: counts[0],
        dangerous: counts[1],
        safe: counts[2]
      })
    })
  }
)
