# Cambium

[![CI](https://github.com/larssondaniel/cambium/actions/workflows/ci.yml/badge.svg)](https://github.com/larssondaniel/cambium/actions/workflows/ci.yml)

Cambium is a GitHub Action that diffs a committed GraphQL schema between a pull
request's merge-base and its head, and posts one comment that tells the reviewer
what breaks, what might, and what is safe.

Cambium needs a schema file committed in the repository, SDL or introspection
JSON. It does not check out code, needs no registry or account, and nothing
leaves GitHub.

Apollo schema checks and GraphQL Hive do this through a schema registry, and
graphql-inspector through a GitHub App or a checkout step. Cambium is the
smaller tool for repositories that only want the comment, and it takes severity
from graphql-js rather than from a vendor's catalogue.

## What reviewers see

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/images/comment-dark.png">
  <img src="docs/images/comment-light.png" width="760" alt="A GitHub pull request comment by github-actions. Heading: Breaking schema change. Counts line: 1 breaking, 2 dangerous, 5 safe. Under Breaking: Query.orders(status:) changed type from OrderStatus to OrderStatus!. Under Dangerous: OrderStatus.REFUNDED added to enum, clients that switch over OrderStatus may not handle it; and Query.search(sort:) optional argument added, existing calls now take its default. Under an expanded section titled 5 safe changes: Invoice type added, Order.invoice added, Query.invoices added, User.displayName added, and User.email deprecated: Use User.contact.email. A closing paragraph reads: This check fails on breaking changes. Adding the label schema-change-accepted accepts them for this pull request. A footer reads Cambium, larssondaniel/cambium.">
</picture>

This is the comment Cambium posts; the live version is on
[pull request #6](https://github.com/larssondaniel/cambium/pull/6) of this
repository, where the safe section is collapsed because something more important
is on the page.

The comment updates in place on every push, and the step fails on breaking
changes, so Cambium can be a required check. When a breaking change is the right
one, a reviewer adds a label to the pull request and the check passes for that
pull request alone.

## Usage

```yaml
name: Schema diff

on:
  pull_request:
    types: [opened, synchronize, reopened, labeled, unlabeled]

permissions:
  contents: read
  pull-requests: write

jobs:
  schema:
    runs-on: ubuntu-latest
    steps:
      - uses: larssondaniel/cambium@v1
        with:
          schema: schema.graphql
```

No checkout step is needed. Cambium reads the schema file at the pull request's
merge-base and at its head through the GitHub API, so the diff matches the Files
tab and is not affected by how, or whether, you check out code.

The `permissions:` block is required. New repositories get a read-only token by
default, and without `pull-requests: write` the comment fails with a 403.
Cambium names the missing lines when that happens.

## Inputs

| Input          | Required | Default                  | Description                                                                                      |
| -------------- | -------- | ------------------------ | ------------------------------------------------------------------------------------------------ |
| `schema`       | yes      |                          | Path of the schema file in the repository. SDL or introspection JSON, detected by content.       |
| `fail-on`      | no       | `breaking`               | Severity at or above which the step fails: `breaking`, `dangerous` or `never`.                   |
| `accept-label` | no       | `schema-change-accepted` | Label that lets the check pass for one pull request when the gate would fail. Empty disables it. |
| `github-token` | no       | `${{ github.token }}`    | Token used to read the file and post the comment. Pass a GitHub App token to post as your app.   |

## Outputs

| Output            | Description                  |
| ----------------- | ---------------------------- |
| `breaking-count`  | Number of breaking changes.  |
| `dangerous-count` | Number of dangerous changes. |
| `safe-count`      | Number of safe changes.      |

The outputs are set before the gate, so a later step can read them even when
Cambium fails the job.

## How changes are classified

Breaking and dangerous changes are exactly what graphql-js, the reference
implementation, reports through its schema-change utilities. A breaking change
can make an existing client operation fail: a removed field, a removed enum
value, an argument made required. A dangerous change keeps operations valid but
can change what they return: a new enum value an old client cannot handle, a new
optional argument, a changed default value. Cambium never reclassifies a change.

Safe changes are everything else: additions, description edits, and deprecations
added or removed. Deprecation reasons are quoted in the comment so reviewers see
the migration message without opening the file.

## Fork pull requests

The workflow token is read-only on pull requests from forks, so Cambium cannot
comment on them. It writes the full report to the job summary instead, emits a
notice saying so, and still applies the `fail-on` gate. Do not switch to
`pull_request_target` to get a comment: it runs with write access and is a known
security hazard.

Dependabot pull requests run with a read-only token, so they get the job summary
and the gate but no comment. A maintainer can add the acceptance label to a fork
or Dependabot pull request, and the gate passes the same way; the job summary
names the label.

## Accepting a breaking change

Some breaking changes are the right ones: a field removed after its deprecation
sunset, an enum value no client has sent in a year. When the check fails, the
comment names the label that lets it through, `schema-change-accepted` by
default. Add the label to the pull request and the step passes for that pull
request alone, with a notice in the run and a line in the comment saying what
was accepted. The verdict, the counts and the sections do not change, so the
comment still lists what was accepted, and removing the label makes the next run
fail again. Set `accept-label` to use a label name of your own, or set it to an
empty string so that no label lets a change through.

Cambium never creates the label. Create it once in the repository, which needs
write access:

```bash
gh label create schema-change-accepted --description "Lets Cambium's check pass for this pull request"
```

The snippet above lists `labeled` and `unlabeled` under `types:` so that adding
or removing the label starts a run on its own, which matters for reviewers with
triage permission, who cannot re-run a workflow. Listing `types:` replaces the
default set, so all five are named. Without them the label still takes effect,
on the next push or a re-run.

Anyone with triage permission or above can add the label, the author included;
Cambium does not check who did. The label is an acceptance, not a review, and it
has no memory: it accepts whatever the gate would fail on at each run, later
pushes included, so remove it when a pull request deserves a second look.
Required reviews and CODEOWNERS on the schema file and the workflow are the
controls.

Do not filter the job with `if:` on the label name. A skipped job satisfies a
required check, so the pull request would merge without a run and the comment
would never say what was accepted.

Teams coming from GraphQL Inspector can keep the label they already use with
`accept-label: approved-breaking-change`.

## Required checks and `paths:` filters

Cambium only comments when the schema changed, so the snippet above runs on
every pull request. If you add a `paths:` filter for the schema file, do not
also make Cambium a required check: pull requests that do not touch the schema
would wait forever for a check that never runs.

## Schema files

Both SDL (`.graphql`) and introspection JSON are accepted, in either the bare
`{ "__schema": ... }` shape or the `{ "data": { "__schema": ... } }` shape.
Introspection results do not carry applied custom directives, so changes to
those cannot be reported from a JSON schema file.

A schema file that is new in the pull request is reported as "New schema" with a
count of its types. A schema file deleted by the pull request is reported as
"Schema removed" and counts as one breaking change. A file that is missing at
both commits, or that does not parse at either, fails the step with the path and
the commit.

To diff two schema files, add the step twice with different `schema` paths. Each
run owns its own comment.

## Design

The reasoning behind the hard-to-reverse decisions lives in
[`docs/adr/`](docs/adr/): committed files rather than generated schemas, the
Contents API rather than a checkout, the merge-base rather than the branch tip,
graphql-js as the source of severity, a label rather than a checkbox or a slash
command for accepting a breaking change, and the name. The vocabulary is in
[`GLOSSARY.md`](GLOSSARY.md), the remaining decisions in
[`docs/design-decisions.md`](docs/design-decisions.md), and the ideas
deliberately left for later in [`docs/v2-ideas.md`](docs/v2-ideas.md).

This repository runs Cambium on its own pull requests against
[`dogfood/schema.graphql`](dogfood/schema.graphql).

## Licence

[MIT](LICENSE)
