/**
 * The renderer seam: synthetic reports for the cases that are impractical to
 * reach through fixture schemas, which are the comment budget and the
 * collapse rule across every combination of sections.
 */
import { describe, expect, it } from '@jest/globals'
import type { Change, Severity } from '../src/diff/index.js'
import { DangerousChangeType } from 'graphql'
import type { Gate } from '../src/gate.js'
import type { Report } from '../src/report.js'
import { phrase, render } from '../src/render.js'

function changes(severity: Severity, count: number): Change[] {
  const kind = {
    breaking: 'FIELD_REMOVED',
    dangerous: 'VALUE_ADDED_TO_ENUM',
    safe: 'FIELD_ADDED'
  } as const
  return Array.from({ length: count }, (_, i) => ({
    severity,
    kind: kind[severity],
    path: `${severity[0].toUpperCase()}${severity.slice(1)}Type.field${String(i).padStart(3, '0')}`
  }))
}

function report(counts: Partial<Record<Severity, number>>): Report {
  return {
    event: 'changed',
    schemaPath: 'schema.graphql',
    changes: [
      ...changes('breaking', counts.breaking ?? 0),
      ...changes('dangerous', counts.dangerous ?? 0),
      ...changes('safe', counts.safe ?? 0)
    ]
  }
}

describe('the reason clause on dangerous lines', () => {
  it.each(Object.values(DangerousChangeType))('%s carries one', (kind) => {
    const line = phrase({
      severity: 'dangerous',
      kind,
      path: 'Type.field',
      subject: 'Other'
    })

    expect(line).toMatch(/ · \S/)
  })

  it('is absent from breaking and safe lines', () => {
    expect(
      phrase({
        severity: 'breaking',
        kind: 'FIELD_REMOVED',
        path: 'User.email'
      })
    ).not.toContain(' · ')
    expect(
      phrase({ severity: 'safe', kind: 'FIELD_ADDED', path: 'User.phone' })
    ).not.toContain(' · ')
  })
})

describe('collapsing the safe section', () => {
  it.each([
    ['breaking only', { breaking: 2 }],
    ['dangerous only', { dangerous: 2 }],
    ['safe only', { safe: 2 }],
    ['breaking and dangerous', { breaking: 1, dangerous: 1 }],
    ['breaking and safe', { breaking: 1, safe: 2 }],
    ['dangerous and safe', { dangerous: 1, safe: 2 }],
    ['breaking, dangerous and safe', { breaking: 1, dangerous: 1, safe: 2 }],
    ['one safe change among others', { breaking: 1, safe: 1 }]
  ])('%s', (_name, counts) => {
    expect(render(report(counts))).toMatchSnapshot()
  })
})

describe('the comment budget', () => {
  const big = report({ breaking: 3, dangerous: 5, safe: 50 })

  it('drops lines from the bottom, safe first, then dangerous, never breaking', () => {
    // Smaller than breaking plus dangerous alone, so every safe line and some dangerous lines must go.
    const budget = render(report({ breaking: 3, dangerous: 5 })).length - 1
    const body = render(big, {
      budget,
      summaryUrl: 'https://github.com/acme/api/actions/runs/1'
    })

    expect(body.length).toBeLessThanOrEqual(budget)
    expect(body).toMatchSnapshot()
    for (const change of changes('breaking', 3))
      expect(body).toContain(change.path)
    expect(body).not.toContain('safe change')
    expect(body).toContain('DangerousType.field000')
    expect(body).not.toContain('DangerousType.field004')
  })

  it('drops only the safe lines it must, keeping the full count in the summary line', () => {
    const full = render(big)
    const body = render(big, { budget: full.length - 200 })

    expect(body).toContain('<details><summary>50 safe changes</summary>')
    expect(body).toContain('SafeType.field000')
    expect(body).not.toContain('SafeType.field049')
    expect(body).toMatch(
      /\n\d+ more changes not shown\. See the job summary for the full report\.\n/
    )
  })

  it('keeps every breaking line even when they alone exceed the budget', () => {
    const body = render(report({ breaking: 40, safe: 2 }), { budget: 100 })

    for (const change of changes('breaking', 40))
      expect(body).toContain(change.path)
    expect(body).toContain('2 more changes not shown')
  })

  it('does not truncate without a budget, which is how the summary is rendered', () => {
    const body = render(report({ safe: 2000 }))

    expect(body).toContain('SafeType.field1999')
    expect(body).not.toContain('not shown')
  })

  it('leaves a body under the budget alone', () => {
    expect(render(big, { budget: 60_000 })).toBe(render(big))
  })
})

describe('the gate line', () => {
  const mixed = report({ breaking: 1, dangerous: 2, safe: 3 })
  const gate = (failOn: Gate['failOn'], accepted: boolean): Gate => ({
    failOn,
    acceptLabel: 'schema-change-accepted',
    accepted
  })
  /** Budget one short of the full body, so lines are dropped and the truncation line appears. */
  const truncating = (body: Report, options: Gate) =>
    render(body, { gate: options }).length - 1

  describe.each([
    ['before the label', false],
    ['after the label', true]
  ])('%s', (_state, accepted) => {
    it.each(['breaking', 'dangerous'] as const)(
      'under fail-on: %s',
      (failOn) => {
        expect(
          render(mixed, { gate: gate(failOn, accepted) })
        ).toMatchSnapshot()
      }
    )

    it.each(['breaking', 'dangerous'] as const)(
      'under fail-on: %s, below the truncation line',
      (failOn) => {
        const body = render(mixed, {
          gate: gate(failOn, accepted),
          budget: truncating(mixed, gate(failOn, accepted)),
          summaryUrl: 'https://github.com/acme/api/actions/runs/1'
        })

        expect(body).toMatchSnapshot()
        expect(body).toMatch(
          /\n\d+ more changes? not shown\. See the \[job summary\]\(https:\/\/github\.com\/acme\/api\/actions\/runs\/1\) for the full report\.\n\n(This check fails on|1 breaking and 2 dangerous changes are accepted|1 breaking change is accepted)/
        )
      }
    )
  })

  it('is the last paragraph before the footer', () => {
    expect(render(mixed, { gate: gate('breaking', false) })).toMatch(
      /\n\nThis check fails on breaking changes\. Adding the label `schema-change-accepted` accepts them for this pull request\.\n\n<sub>Cambium/
    )
  })

  it('survives a budget too small for the breaking lines, along with every breaking line', () => {
    const many = report({ breaking: 40, safe: 2 })
    const body = render(many, { gate: gate('breaking', false), budget: 100 })

    for (const change of changes('breaking', 40))
      expect(body).toContain(change.path)
    expect(body).toContain('2 more changes not shown')
    expect(body).toContain('Adding the label `schema-change-accepted`')
  })

  it('is absent when the gate would pass, when the label is off, and under fail-on: never', () => {
    const line = /This check fails on|accepted for this pull request/
    expect(render(mixed)).not.toMatch(line)
    expect(
      render(mixed, { gate: { failOn: 'breaking', accepted: true } })
    ).not.toMatch(line)
    expect(render(mixed, { gate: gate('never', false) })).not.toMatch(line)
    expect(render(mixed, { gate: gate('never', true) })).not.toMatch(line)
    expect(
      render(report({ dangerous: 2, safe: 3 }), {
        gate: gate('breaking', false)
      })
    ).not.toMatch(line)
  })

  it('wraps the label name in a code span that survives backticks', () => {
    const body = render(mixed, {
      gate: { failOn: 'breaking', acceptLabel: '`accepted`', accepted: false }
    })

    expect(body).toContain('Adding the label `` `accepted` `` accepts')
  })
})

describe('whole-file events', () => {
  it('renders a new schema with its inventory', () => {
    expect(
      render({
        event: 'new-schema',
        schemaPath: 'schema.graphql',
        inventory: {
          types: 4,
          interfaces: 1,
          unions: 0,
          enums: 2,
          inputTypes: 0,
          scalars: 1,
          directives: 0
        }
      })
    ).toMatchSnapshot()
  })

  it('renders a removed schema as one breaking change', () => {
    expect(
      render({ event: 'schema-removed', schemaPath: 'schema.graphql' })
    ).toMatchSnapshot()
  })

  it('gives a removed schema a gate line and a new schema none', () => {
    const gate: Gate = {
      failOn: 'breaking',
      acceptLabel: 'schema-change-accepted',
      accepted: false
    }

    expect(
      render(
        { event: 'schema-removed', schemaPath: 'schema.graphql' },
        { gate }
      )
    ).toContain(
      '\n\nThis check fails on breaking changes. Adding the label `schema-change-accepted` accepts them for this pull request.\n\n<sub>'
    )
    expect(
      render(
        {
          event: 'new-schema',
          schemaPath: 'schema.graphql',
          inventory: {
            types: 1,
            interfaces: 0,
            unions: 0,
            enums: 0,
            inputTypes: 0,
            scalars: 0,
            directives: 0
          }
        },
        { gate }
      )
    ).not.toContain('This check fails')
  })
})

describe('a change graphql-js describes in words Cambium does not recognise', () => {
  it("is still shown, in graphql-js's words, under its severity", () => {
    const body = render({
      event: 'changed',
      schemaPath: 'schema.graphql',
      changes: [
        {
          severity: 'breaking',
          kind: 'UNRECOGNIZED',
          path: '',
          description: 'Something novel happened.'
        }
      ]
    })

    expect(body).toContain('#### Breaking\n\n- Something novel happened\n')
  })

  it('escapes markup in those words too', () => {
    const body = render({
      event: 'changed',
      schemaPath: 'schema.graphql',
      changes: [
        {
          severity: 'safe',
          kind: 'UNRECOGNIZED',
          path: '',
          description: 'Field <b>x</b> pinged @someone.'
        }
      ]
    })

    expect(body).toContain('- Field \\<b\\>x\\</b\\> pinged @\u200bsomeone\n')
  })
})
