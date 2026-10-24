import type {
  GitHubPort,
  StickyCommentRequest,
  StickyCommentResult
} from '../src/github.js'

/**
 * In-memory fake of the GitHub port. Holds files by sha and path, a
 * merge-base, an optional existing sticky comment, and a flag that makes
 * comment writes come back forbidden. Records what Cambium wrote.
 */
export class FakeGitHub implements GitHubPort {
  readonly files = new Map<string, string>()
  mergeBase = 'mergebase0000000000000000000000000000000'
  existingComment: string | undefined
  /** Makes the comment lookup (`read`) or the comment write (`write`) come back forbidden. */
  forbidden: false | 'read' | 'write' = false
  /** Makes the comment call throw, as a 5xx or a 422 from GitHub would. */
  commentError: Error | undefined

  /** Arguments of the one merge-base call, when made. */
  mergeBaseRequest: { baseSha: string; headSha: string } | undefined
  summary: string | undefined
  comment: { body: string; result: StickyCommentResult } | undefined

  file(sha: string, path: string, text: string): this {
    this.files.set(`${sha}:${path}`, text)
    return this
  }

  async resolveMergeBase(baseSha: string, headSha: string): Promise<string> {
    this.mergeBaseRequest = { baseSha, headSha }
    return this.mergeBase
  }

  async readFile(path: string, sha: string): Promise<string | undefined> {
    return this.files.get(`${sha}:${path}`)
  }

  async upsertStickyComment({
    marker,
    body,
    createIfMissing
  }: StickyCommentRequest): Promise<StickyCommentResult> {
    if (!body.includes(marker)) throw new Error('comment body lacks its marker')
    if (this.commentError) throw this.commentError
    if (this.forbidden === 'read') return 'forbidden'
    const existing = this.existingComment?.includes(marker)
    if (!existing && !createIfMissing) return 'none'
    if (this.forbidden === 'write') {
      this.comment = { body, result: 'forbidden' }
      return 'forbidden'
    }
    this.comment = { body, result: existing ? 'updated' : 'created' }
    return this.comment.result
  }

  async writeSummary(markdown: string): Promise<void> {
    this.summary = markdown
  }
}
