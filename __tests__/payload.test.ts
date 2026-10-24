import { describe, expect, it } from '@jest/globals'
import { pullRequestFromPayload } from '../src/payload.js'

const base = { sha: 'tip0000', repo: { full_name: 'acme/api' } }

describe('reading the pull request from the event payload', () => {
  it('maps number, shas and a same-repository head', () => {
    expect(
      pullRequestFromPayload({
        number: 7,
        base,
        head: { sha: 'head000', repo: { full_name: 'acme/api' } }
      })
    ).toEqual({
      number: 7,
      baseSha: 'tip0000',
      headSha: 'head000',
      fromFork: false
    })
  })

  it('marks a head from another repository as a fork', () => {
    expect(
      pullRequestFromPayload({
        number: 7,
        base,
        head: { sha: 'head000', repo: { full_name: 'someone/api' } }
      })
    ).toMatchObject({ fromFork: true })
  })

  it('marks a deleted fork, whose head repository is null, as a fork', () => {
    expect(
      pullRequestFromPayload({
        number: 7,
        base,
        head: { sha: 'head000', repo: null }
      })
    ).toMatchObject({
      fromFork: true
    })
  })
})
