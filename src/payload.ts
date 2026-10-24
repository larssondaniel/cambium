import type { PullRequest } from './run.js'

/** The slice of a `pull_request` event payload Cambium reads. */
export interface PullRequestPayload {
  number: number
  base: { sha: string; repo: { full_name: string } }
  /** `repo` is null when the fork the head came from has been deleted. */
  head: { sha: string; repo: { full_name: string } | null }
}

/**
 * Reads the pull request out of the event payload. The head is from a fork
 * when its repository is not the base repository, or is gone.
 */
export function pullRequestFromPayload(
  payload: PullRequestPayload
): PullRequest {
  return {
    number: payload.number,
    baseSha: payload.base.sha,
    headSha: payload.head.sha,
    fromFork: payload.head.repo?.full_name !== payload.base.repo.full_name
  }
}
