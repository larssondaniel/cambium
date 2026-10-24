import * as core from '@actions/core'
import type { getOctokit } from '@actions/github'
import type {
  GitHubPort,
  StickyCommentRequest,
  StickyCommentResult
} from './github.js'

type Octokit = ReturnType<typeof getOctokit>

/**
 * The GitHub port implemented with Octokit. Thin by design: it maps calls and
 * turns two HTTP statuses into port vocabulary (404 on a file is "absent",
 * 403 on a comment or on the labels is "forbidden"). It is proven by the repository's own
 * dogfooding workflow, not by unit tests.
 */
export class OctokitGitHub implements GitHubPort {
  constructor(
    private readonly octokit: Octokit,
    private readonly repo: { owner: string; repo: string },
    private readonly pullNumber: number
  ) {}

  async resolveMergeBase(baseSha: string, headSha: string): Promise<string> {
    const { data } = await this.octokit.rest.repos.compareCommitsWithBasehead({
      ...this.repo,
      basehead: `${baseSha}...${headSha}`,
      per_page: 1
    })
    return data.merge_base_commit.sha
  }

  async readFile(path: string, sha: string): Promise<string | undefined> {
    try {
      const { data } = await this.octokit.rest.repos.getContent({
        ...this.repo,
        path,
        ref: sha,
        mediaType: { format: 'raw' }
      })
      if (typeof data !== 'string') {
        throw new Error(`\`${path}\` at ${sha.slice(0, 7)} is not a file.`)
      }
      return data
    } catch (error) {
      if (statusOf(error) === 404) return undefined
      if (statusOf(error) === 403) {
        throw new Error(
          `Could not read \`${path}\` at ${sha.slice(0, 7)}: GitHub returned 403. ` +
            "Add `contents: read` to the job's `permissions:` block.",
          { cause: error }
        )
      }
      throw error
    }
  }

  async upsertStickyComment({
    marker,
    body,
    createIfMissing
  }: StickyCommentRequest): Promise<StickyCommentResult> {
    try {
      // On a private repository a read-only token is refused here already.
      const comments = await this.octokit.paginate(
        this.octokit.rest.issues.listComments,
        {
          ...this.repo,
          issue_number: this.pullNumber,
          per_page: 100
        }
      )
      const existing = comments.find((comment) =>
        comment.body?.includes(marker)
      )
      if (existing) {
        await this.octokit.rest.issues.updateComment({
          ...this.repo,
          comment_id: existing.id,
          body
        })
        return 'updated'
      }
      if (!createIfMissing) return 'none'
      await this.octokit.rest.issues.createComment({
        ...this.repo,
        issue_number: this.pullNumber,
        body
      })
      return 'created'
    } catch (error) {
      if (statusOf(error) === 403) return 'forbidden'
      throw error
    }
  }

  async listLabels(): Promise<string[] | 'forbidden'> {
    try {
      // Pull requests are issues to the labels endpoint, which reads with
      // either `issues: read` or `pull-requests: read`.
      const labels = await this.octokit.paginate(
        this.octokit.rest.issues.listLabelsOnIssue,
        {
          ...this.repo,
          issue_number: this.pullNumber,
          per_page: 100
        }
      )
      return labels.map((label) => label.name)
    } catch (error) {
      if (statusOf(error) === 403) return 'forbidden'
      throw error
    }
  }

  async writeSummary(markdown: string): Promise<void> {
    try {
      await core.summary.addRaw(markdown, true).write()
    } catch (error) {
      // A summary over the 1 MiB cap must not cost the comment, the outputs or the gate.
      core.warning(
        `Could not write the job summary: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }
}

function statusOf(error: unknown): number | undefined {
  return typeof error === 'object' && error !== null && 'status' in error
    ? (error as { status?: number }).status
    : undefined
}
