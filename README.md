# Cambium

[![CI](https://github.com/larssondaniel/cambium/actions/workflows/ci.yml/badge.svg)](https://github.com/larssondaniel/cambium/actions/workflows/ci.yml)
[![Check dist/](https://github.com/larssondaniel/cambium/actions/workflows/check-dist.yml/badge.svg)](https://github.com/larssondaniel/cambium/actions/workflows/check-dist.yml)
[![CodeQL](https://github.com/larssondaniel/cambium/actions/workflows/codeql-analysis.yml/badge.svg)](https://github.com/larssondaniel/cambium/actions/workflows/codeql-analysis.yml)
![Coverage](badges/coverage.svg)

Cambium is a GitHub Action that diffs a committed GraphQL schema between a pull
request's merge-base and its head, and posts one comment that tells the reviewer
what breaks, what might, and what is safe.

Cambium needs a schema file committed in the repository, SDL or introspection
JSON. It does not check out code, needs no registry or account, and nothing
leaves GitHub.

## What reviewers see

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/images/comment-dark.png">
  <img src="docs/images/comment-light.png" width="800" alt="A GitHub pull request comment by github-actions. Heading: Breaking schema change. Counts line: 1 breaking, 2 dangerous, 5 safe. Under Breaking: Query.orders(status:) changed type from OrderStatus to OrderStatus!. Under Dangerous: OrderStatus.REFUNDED added to enum, clients that switch over OrderStatus may not handle it; and Query.search(sort:) optional argument added, existing calls now take its default. Then a collapsed section titled 5 safe changes, and a footer reading Cambium, larssondaniel/cambium.">
</picture>

This is Cambium's own comment on
[pull request #6](https://github.com/larssondaniel/cambium/pull/6) of this
repository, which changes the fixture schema the way a real pull request would.
Expanding "5 safe changes" shows `User.email` deprecated with its reason quoted,
and four additions: `Invoice`, `Query.invoices`, `Order.invoice` and
`User.displayName`.

The comment updates in place on every push, and the step fails on breaking
changes, so Cambium can be a required check.

## Usage

```yaml
name: Schema diff

on:
  pull_request:

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

| Input          | Required | Default               | Description                                                                                    |
| -------------- | -------- | --------------------- | ---------------------------------------------------------------------------------------------- |
| `schema`       | yes      |                       | Path of the schema file in the repository. SDL or introspection JSON, detected by content.     |
| `fail-on`      | no       | `breaking`            | Severity at or above which the step fails: `breaking`, `dangerous` or `never`.                 |
| `github-token` | no       | `${{ github.token }}` | Token used to read the file and post the comment. Pass a GitHub App token to post as your app. |

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
and the gate but no comment.

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
graphql-js as the source of severity, and the name. The vocabulary is in
[`GLOSSARY.md`](GLOSSARY.md), the remaining decisions in
[`docs/design-decisions.md`](docs/design-decisions.md), and the ideas
deliberately left for later in [`docs/v2-ideas.md`](docs/v2-ideas.md).

This repository runs Cambium on its own pull requests against
[`dogfood/schema.graphql`](dogfood/schema.graphql).

## Licence

[MIT](LICENSE)
