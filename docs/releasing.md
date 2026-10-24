# Releasing

Releases are made by hand; the floating major tag is moved by a workflow.

1. Update `package.json`'s `version` and move the `Unreleased` section of
   `CHANGELOG.md` under the new version.
2. Run `npm run all` so `dist/` matches the source. Run `npm run screenshots`
   and commit `docs/images` if they changed; the committed pair is the output
   of the Check screenshots workflow on Linux, so on another OS take its
   artifact instead. Then commit and merge to `main`. The check-dist and
   check-screenshots workflows fail CI when either drifts.
3. Draft a GitHub release with tag `vX.Y.Z`, tick **Publish this Action to
   the GitHub Marketplace**, and choose the category **Code review**.
4. Publishing the release triggers
   [`move-major-tag.yml`](../.github/workflows/move-major-tag.yml), which
   force-moves the plain `v1` tag to the release commit.

Keep `v1` a plain git tag, never a GitHub release. If immutable releases are
enabled for the repository, a release tagged `v1` could never move again.
`actions/publish-action` is not used: its own README marks it alpha and for
internal use.
