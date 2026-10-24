# Changelog

All notable changes to Cambium are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/).

## [Unreleased]

## [1.0.0] - 2026-10-24

Cambium diffs a committed GraphQL schema between a pull request's merge-base and
its head, and reports every change in one pull request comment.

### Added

- The schema file is read at the merge-base and at the head through the GitHub
  API, so the diff matches the Files tab and no checkout is needed.
- Changes are classified as breaking, dangerous or safe by graphql-js, the
  reference implementation; Cambium never reclassifies. Dangerous lines carry a
  reason clause saying what an existing client does with the change.
  Deprecations added, removed or reworded are reported as safe.
- One sticky comment per schema file, updated in place on every push: a verdict
  in words, one line of counts, then the changes grouped by severity and sorted
  by schema path, with safe changes collapsed when anything more important is on
  the page. Schema text is shown as text, never as markup.
- A `fail-on` gate (`breaking` by default, or `dangerous` or `never`) so Cambium
  can be a required check, and three count outputs set before the gate.
- The full report in the job summary on every run. Pull requests from forks and
  from Dependabot, whose token is read-only, get the summary, a notice and the
  gate instead of a comment.
- SDL and introspection JSON schema files, detected by content. A new schema
  file is reported with its type counts; a deleted one counts as breaking.
- Three inputs: `schema`, `fail-on` and `github-token`.

[Unreleased]: https://github.com/larssondaniel/cambium/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/larssondaniel/cambium/releases/tag/v1.0.0
