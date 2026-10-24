# v2 ideas

Logged during v1 design so v1 does not absorb them. Not commitments.

- **Generate the head schema in the workflow.** Let a prior step produce the schema file for code-first teams that do not commit it. Needs an answer for where the base schema comes from. See ADR-0001.
- **Per-PR acknowledgement label.** A label such as `schema-change-accepted` that a reviewer adds to let a breaking change through without editing `fail-on`. The comment would tell the reader which label to add. Visible, per-PR, reviewer-owned. _Taken for 1.1.0; see decision 17 in `design-decisions.md`._
- **Open in Canopy.** A deep link from the comment that opens the head schema in Canopy. Blocked on Canopy being able to open an SDL file from a URL, and on Canopy being ready for strangers. Until then Canopy is not mentioned by the action.
- **Two-workflow mode for fork PRs.** A `mode` input: write the report as an artifact on `pull_request`, post it from a `workflow_run` job. GitHub's recommended pattern; doubles the surface area, so not v1.
- **Custom bot identity.** Posting as "Cambium" instead of github-actions[bot] needs a GitHub App. The `github-token` input already accepts an App token, so this is docs plus an App, not code.
- **Logo or wordmark.** Marketplace branding icon is enough for v1.
- **Several schemas in one comment.** A multi-path `schema` input with a section per schema. Makes headline, counts, gate and truncation per-schema; not v1.
