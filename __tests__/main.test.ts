/**
 * The runner wiring: inputs and the event payload in, toolkit calls out. The
 * orchestrator and the Octokit adapter are mocked; this covers only the glue.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import * as core from '../__fixtures__/core.js'
import * as github from '../__fixtures__/actions-github.js'
import type { run as runType } from '../src/run.js'

const run = jest.fn<typeof runType>()

jest.unstable_mockModule('@actions/core', () => core)
jest.unstable_mockModule('@actions/github', () => github)
jest.unstable_mockModule('../src/run.js', () => ({ run }))
jest.unstable_mockModule('../src/octokit-github.js', () => ({
  OctokitGitHub: jest.fn()
}))

const { main } = await import('../src/main.js')

const pullRequest = {
  number: 7,
  user: { login: 'octocat' },
  base: { sha: 'tip0000', repo: { full_name: 'acme/api' } },
  head: { sha: 'head000', repo: { full_name: 'acme/api' } }
}

describe('main', () => {
  beforeEach(() => {
    jest.resetAllMocks()
    github.context.eventName = 'pull_request'
    github.context.payload = { pull_request: pullRequest }
    core.getInput.mockImplementation(
      (name) =>
        ({
          schema: 'schema.graphql',
          'fail-on': '',
          'accept-label': 'schema-change-accepted',
          'github-token': 't'
        })[name] ?? ''
    )
  })

  it('fails outside pull_request events', async () => {
    github.context.eventName = 'push'
    github.context.payload = {}

    await main()

    expect(core.setFailed).toHaveBeenCalledWith(
      'Cambium runs on pull_request events; this run was triggered by push.'
    )
    expect(run).not.toHaveBeenCalled()
  })

  it('passes inputs and the pull request to the orchestrator and applies its outcome', async () => {
    run.mockResolvedValue({
      outputs: { breaking: 1, dangerous: 2, safe: 3 },
      notices: ['first note', 'second note'],
      failure: 'nope'
    })

    await main()

    expect(run).toHaveBeenCalledWith(
      expect.objectContaining({
        inputs: {
          schema: 'schema.graphql',
          failOn: 'breaking',
          acceptLabel: 'schema-change-accepted'
        },
        pullRequest: {
          number: 7,
          baseSha: 'tip0000',
          headSha: 'head000',
          readOnlyToken: undefined
        },
        summaryUrl: 'https://github.com/acme/api/actions/runs/42'
      })
    )
    expect(core.setOutput).toHaveBeenCalledWith('breaking-count', 1)
    expect(core.setOutput).toHaveBeenCalledWith('dangerous-count', 2)
    expect(core.setOutput).toHaveBeenCalledWith('safe-count', 3)
    expect(core.notice.mock.calls).toEqual([['first note'], ['second note']])
    expect(core.setFailed).toHaveBeenCalledWith('nope')
  })

  it('passes an empty accept-label through as empty, with no fallback to the default', async () => {
    core.getInput.mockImplementation(
      (name) => ({ schema: 'schema.graphql', 'github-token': 't' })[name] ?? ''
    )
    run.mockResolvedValue({ notices: [] })

    await main()

    expect(run).toHaveBeenCalledWith(
      expect.objectContaining({
        inputs: {
          schema: 'schema.graphql',
          failOn: 'breaking',
          acceptLabel: ''
        }
      })
    )
    expect(core.notice).not.toHaveBeenCalled()
    expect(core.setFailed).not.toHaveBeenCalled()
  })

  it('fails with the message of an Error the orchestrator throws', async () => {
    run.mockRejectedValue(new Error('boom'))

    await main()

    expect(core.setFailed).toHaveBeenCalledWith('boom')
  })

  it('fails even when what is thrown is not an Error', async () => {
    run.mockRejectedValue('a bare string')

    await main()

    expect(core.setFailed).toHaveBeenCalledWith('a bare string')
  })
})
