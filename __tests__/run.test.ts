/**
 * The run seam: the orchestrator driven from the outside with an in-memory
 * fake of the GitHub port and fixture schema pairs. Assertions are what a
 * user would observe: the comment body, the summary body, the outputs and
 * the failure message.
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
  fromFork?: boolean
  existingComment?: string
  forbidden?: 'read' | 'write'
  commentError?: Error
  schema?: string
}

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
  const outcome = await run({
    inputs: { schema, failOn: scenario.failOn ?? 'breaking' },
    pullRequest: {
      number: 7,
      baseSha: BASE_SHA,
      headSha: HEAD_SHA,
      fromFork: scenario.fromFork ?? false
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
    const dangerous = {
      base: 'enum OrderStatus { PAID }',
      head: 'enum OrderStatus { PAID REFUNDED }'
    }

    expect((await cambium(dangerous)).outcome.failure).toBeUndefined()
    expect(
      (await cambium({ ...dangerous, failOn: 'dangerous' })).outcome.failure
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
    const { outcome, github } = await cambium({ ...example, fromFork: true })

    expect(github.comment).toBeUndefined()
    expect(github.summary).toContain('### Breaking schema change')
    expect(outcome.notice).toBe(
      'This pull request comes from a fork, so Cambium cannot comment on it. The report is in the job summary.'
    )
  })

  it('still applies the gate and sets outputs', async () => {
    const { outcome } = await cambium({ ...example, fromFork: true })

    expect(outcome.failure).toBe(
      '1 breaking change in `schema.graphql` (fail-on: breaking).'
    )
    expect(outcome.outputs).toEqual({ breaking: 1, dangerous: 2, safe: 5 })
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
