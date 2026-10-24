import type * as github from '@actions/github'
import { jest } from '@jest/globals'

/** A mutable stand-in for `@actions/github`'s context; tests set `payload` and `eventName`. */
export const context = {
  eventName: 'pull_request',
  runId: 42,
  serverUrl: 'https://github.com',
  repo: { owner: 'acme', repo: 'api' },
  payload: {} as Record<string, unknown>
}

export const getOctokit = jest.fn<typeof github.getOctokit>()
