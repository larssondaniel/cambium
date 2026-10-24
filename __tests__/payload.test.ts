import { describe, expect, it } from '@jest/globals'
import { pullRequestFromPayload } from '../src/payload.js'

const base = { sha: 'tip0000', repo: { full_name: 'acme/api' } }
const user = { login: 'octocat' }
const sameRepoHead = { sha: 'head000', repo: { full_name: 'acme/api' } }

describe('reading the pull request from the event payload', () => {
  it('maps number, shas and a same-repository head', () => {
    expect(
      pullRequestFromPayload({ number: 7, user, base, head: sameRepoHead })
    ).toEqual({
      number: 7,
      baseSha: 'tip0000',
      headSha: 'head000',
      readOnlyToken: undefined
    })
  })

  it('marks a head from another repository as a fork', () => {
    expect(
      pullRequestFromPayload({
        number: 7,
        user,
        base,
        head: { sha: 'head000', repo: { full_name: 'someone/api' } }
      })
    ).toMatchObject({ readOnlyToken: 'fork' })
  })

  it('marks a deleted fork, whose head repository is null, as a fork', () => {
    expect(
      pullRequestFromPayload({
        number: 7,
        user,
        base,
        head: { sha: 'head000', repo: null }
      })
    ).toMatchObject({ readOnlyToken: 'fork' })
  })

  it('marks a Dependabot pull request, whose token is read-only on its own branch, like a fork', () => {
    expect(
      pullRequestFromPayload({
        number: 7,
        user: { login: 'dependabot[bot]' },
        base,
        head: sameRepoHead
      })
    ).toMatchObject({ readOnlyToken: 'dependabot' })
  })
})
