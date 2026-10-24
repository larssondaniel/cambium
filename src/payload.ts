import type { PullRequest } from './run.js'

/** The slice of a `pull_request` event payload Cambium reads. */
export interface PullRequestPayload {
  number: number
  user: { login: string }
  base: { sha: string; repo: { full_name: string } }
  /** `repo` is null when the fork the head came from has been deleted. */
  head: { sha: string; repo: { full_name: string } | null }
}

/**
 * Reads the pull request out of the event payload. The token is read-only,
 * so the comment is impossible, when the head is from a fork (its repository
 * is not the base repository, or is gone) or when Dependabot opened the pull
 * request, which GitHub treats the same way even on a same-repository branch.
 */
export function pullRequestFromPayload(
  payload: PullRequestPayload
): PullRequest {
  return {
    number: payload.number,
    baseSha: payload.base.sha,
    headSha: payload.head.sha,
    readOnlyToken: readOnlyTokenReason(payload)
  }
}

function readOnlyTokenReason(
  payload: PullRequestPayload
): PullRequest['readOnlyToken'] {
  if (payload.head.repo?.full_name !== payload.base.repo.full_name)
    return 'fork'
  if (payload.user.login === 'dependabot[bot]') return 'dependabot'
  return undefined
}
