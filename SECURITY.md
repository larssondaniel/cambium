# Security

## Reporting a vulnerability

Report vulnerabilities privately through
[GitHub's private vulnerability reporting](https://github.com/larssondaniel/cambium/security/advisories/new).
Do not open a public issue for anything that could be exploited before it is
fixed.

Include the version or commit you tested, the workflow snippet you ran, and what
you observed. Expect an acknowledgement within a week.

## What counts

Cambium runs inside a GitHub Actions job with the token the workflow gives it.
Reports are welcome on anything that would let a pull request make Cambium do
more than read one file and post one comment, such as:

- a schema file crafted so that the comment carries markdown or HTML the author
  controls beyond the change descriptions;
- the token, or any other secret, reaching the comment, the job summary or the
  log;
- a code path that writes to the repository, or to another repository, instead
  of commenting.

Cambium never runs with `pull_request_target`, and the README asks users not to.
A report that depends on a workflow granting more than `pull-requests: write` is
still welcome, but is lower severity.

## Supported versions

Only the latest release on the `v1` tag receives fixes. Pin to `v1` to receive
them without a workflow edit, or pin to a full commit SHA if you prefer to
review each update.
