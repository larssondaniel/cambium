# Contributing

## Setup

Use the Node.js version in [`.node-version`](.node-version), then:

```bash
npm install
npm run all
```

`npm run all` formats, lints, runs the tests, refreshes the coverage badge and
rebuilds `dist/`. Run it before every commit that touches `src/`: the bundle in
`dist/` is what `uses: larssondaniel/cambium@v1` executes, so it is committed,
and the check-dist workflow fails when it drifts from the source.

## Running locally

```bash
npm run local-action
```

This runs the action from `src/main.ts` with the inputs in `.env`. Copy
[`.env.example`](.env.example) to `.env` first; the comments in it say which
variables a `pull_request` run needs.

## Tests

```bash
npm test
```

Unit tests live in `__tests__/` with fixtures in `__fixtures__/`. The Octokit
adapter and the runner wiring are covered by the Cambium workflow, which runs
the action on this repository's own pull requests against
[`dogfood/schema.graphql`](dogfood/schema.graphql). A pull request that edits
that file gets a comment describing the edit.

## Pull requests

`main` only takes changes through pull requests, and the tests, lint, CodeQL and
check-dist workflows must pass before merging. Keep the vocabulary of
[`GLOSSARY.md`](GLOSSARY.md); a change that reverses a decision recorded in
[`docs/adr/`](docs/adr/) needs a new ADR rather than an edit to the old one. Add
user-visible changes to the `Unreleased` section of
[`CHANGELOG.md`](CHANGELOG.md).

Releases are described in [`docs/releasing.md`](docs/releasing.md).
