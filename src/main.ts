import * as core from '@actions/core'
import * as github from '@actions/github'
import { OctokitGitHub } from './octokit-github.js'
import { pullRequestFromPayload, type PullRequestPayload } from './payload.js'
import { run } from './run.js'

/**
 * Wires the action to the runner: reads inputs and the pull request from the
 * event payload, builds the Octokit adapter, runs Cambium and reports the
 * outcome through the toolkit.
 */
export async function main(): Promise<void> {
  try {
    const { context } = github
    const payload = context.payload.pull_request
    if (!payload) {
      core.setFailed(
        `Cambium runs on pull_request events; this run was triggered by ${context.eventName}.`
      )
      return
    }

    const octokit = github.getOctokit(
      core.getInput('github-token', { required: true })
    )
    const outcome = await run({
      inputs: {
        schema: core.getInput('schema', { required: true }),
        failOn: core.getInput('fail-on') || 'breaking'
      },
      // The toolkit types everything under `pull_request` except `number` as `any`.
      pullRequest: pullRequestFromPayload(payload as PullRequestPayload),
      github: new OctokitGitHub(octokit, context.repo, payload.number),
      summaryUrl: `${context.serverUrl}/${context.repo.owner}/${context.repo.repo}/actions/runs/${context.runId}`
    })

    if (outcome.outputs) {
      core.setOutput('breaking-count', outcome.outputs.breaking)
      core.setOutput('dangerous-count', outcome.outputs.dangerous)
      core.setOutput('safe-count', outcome.outputs.safe)
    }
    if (outcome.notice) core.notice(outcome.notice)
    if (outcome.failure) core.setFailed(outcome.failure)
  } catch (error) {
    core.setFailed(error instanceof Error ? error.message : String(error))
  }
}
