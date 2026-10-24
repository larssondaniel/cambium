---
status: accepted
---

# An acceptance label lets one pull request pass the gate

Cambium fails the step when a change at or above the `fail-on` severity exists, so it can be a required check. Some breaking changes are correct, such as removing a field after its deprecation sunset, and a team needs a way to let one through without lowering the gate for every later pull request. That way is a label on the pull request, named by the `accept-label` input (default `schema-change-accepted`), read live on every run. When it is present and the gate would fail, the step passes and the comment says so; the verdict, counts and sections never change.

## Considered Options

- **A label (chosen).** GitHub's own primitive for "a human marked this pull request as an exception". Triage permission can apply it, which is less than merge rights and more than nothing. Reading labels needs only read access, so it works on fork and Dependabot pull requests. The timeline records who added and removed it, and a label search lists the pull requests that carry it. GraphQL Inspector, changelog-enforcer and Kubernetes' Prow all use a label to let a person change what a check decides.
- **Letting a bypass actor merge the red pull request.** Already exists in branch protection and rulesets, and costs no code. But it needs admin rights, the check stays red, the comment never acknowledges anything, and most teams treat an admin merging a red pull request as a smell.
- **A checkbox in Cambium's own comment.** The reviewer ticks "accept" inside the sticky comment. Zero setup and it lives in the product, but ticking edits a comment, which fires `issue_comment` rather than `pull_request`, so the action would need a second mode without a pull request payload. The tick would be state kept in a body anyone with write can edit, and fork pull requests have no comment to tick, so they would have no path at all.
- **A marker in the title or body**, such as Conventional Commits' `feat!:`. Author-owned, bound to a convention many teams do not use, and the author acknowledging their own breaking change is not the review step wanted.
- **A slash command in a comment.** Needs `issue_comment`, a parser and permission checks for the same outcome as a label.
- **An approving review.** Every pull request gets one, so a breaking change would pass because someone approved the typo fixes.

## Consequences

- The label name becomes configuration in users' workflows, which is why this is an ADR: renaming the input or changing the default later is a breaking change for them. The name is ours, not Inspector's, so upgrading switches nothing on in repositories that carry Inspector's label.
- The gate is a convention, not a security boundary. On `pull_request` the workflow runs from the pull request's own head, so an author could already lower `fail-on` inside the pull request. The label makes the exception reviewer-visible; required reviews and CODEOWNERS remain the controls.
- Adding a label does not start a run unless the workflow lists `labeled` and `unlabeled` under `types:`, which the README snippet now does. Labels are read through the API rather than from the event payload, so a re-run also sees them.
- The label has no memory of what it accepted. It accepts whatever the gate would fail on at each run, including changes pushed after it was added; removing it is how a team asks for a second look. Removing it automatically on push, as Prow does with `lgtm`, is not built.
- Whether branch protection takes the newest same-named check run for a commit is not documented. The repository's own dogfood pull request, with the check made required, is where it is observed.
- Cambium never creates the label and never checks who added it. Both would be code standing in for GitHub's own permission model.
