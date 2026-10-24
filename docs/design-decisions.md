# Design decisions

Running log from the design sessions. ADRs hold the reasoning for the hard-to-reverse ones; this file holds the rest.

## v1, 2026-10-23

Input to the v1 spec, published as larssondaniel/cambium#1.

1. **Schemas are committed files**, read at the PR's base and head. The action never generates or introspects. (ADR-0001)
2. **Fetched via the Contents API**, no `actions/checkout` required or used. (ADR-0002)
3. **Base is the merge-base**, resolved with the compare API, so the diff matches GitHub's Files tab. (ADR-0003)
4. **Absent or unparsable schema file:**
   - absent at both commits: fail the step, name the path and both shas
   - absent at base, present at head: comment reports a new schema with type counts; nothing is breaking
   - present at base, absent at head: comment reports the schema as removed, classified breaking
   - unparsable at either commit: fail the step with the parser error and the commit it came from
   - known wart: a PR that moves the file and updates the `schema` input together looks like a new schema. Documented, not detected.
5. **Format is detected by content**, not declared. First non-whitespace `{` means introspection JSON (both `{ "__schema" }` and `{ "data": { "__schema" } }` shapes); anything else is SDL. Each side detected independently. README notes that introspection JSON does not carry applied custom directives.
6. **Diff engine:** graphql-js `findSchemaChanges` defines breaking, dangerous and safe; a walker of our own adds only deprecations added, removed or reworded, which graphql-js does not report. We render graphql-js's judgement; we do not reclassify it. (ADR-0004, amended 2026-10-24)
7. **Gate:** `fail-on` input, values `breaking` | `dangerous` | `never`, default `breaking`. The step fails when any change at or above that severity exists. No per-PR override in v1.
8. **Comment headline:** verdict in words first (`Breaking schema change` / `Schema changed, nothing breaking` / `New schema` / `Schema removed` / `No schema changes`), then one line of counts (`1 breaking · 2 dangerous · 5 safe`). No emoji. Zero state updates the sticky comment to `No schema changes` rather than deleting it; nothing is posted if there was never a comment and there are no changes. The headline is reused as the step summary title.
9. **Grouping:** by severity (Breaking, Dangerous, Safe), sections in that order, omitted when empty. Within a section, sorted by schema path. One line per change: schema path in code, plain verb, before and after when a value changed. Argument paths read `Type.field(arg:)`. Descriptions and deprecation reasons quoted inline when short, truncated with an ellipsis otherwise. Dangerous lines carry a fixed reason clause after a middle dot, one per reason; breaking and safe lines do not.
10. **Collapsing and length:** Breaking and Dangerous always expanded. Safe wrapped in `<details>` with the count in the summary line whenever a Breaking or Dangerous section exists; expanded when Safe is the only section. No numeric thresholds. Comment budget ~60k characters (API limit 65,536, undocumented). The step summary always carries the full report (1 MiB limit). When the comment overflows, lines are dropped from the bottom: safe first, then dangerous, never breaking, ending with `N more changes not shown. See the job summary for the full report.`
11. **Canopy:** not mentioned in v1 at all. The comment carries one small footer line naming the action and linking to its repo; nothing else. A README "Related" line pointing at Canopy is added when Canopy is usable (a docs-only change). An "Open in Canopy" deep link is v2 and needs Canopy to open an SDL file from a URL first.
12. **Fork PRs:** when the head repo differs from the base repo, skip the comment, write the full report to the step summary, emit a notice annotation pointing there, and still apply the `fail-on` gate. A PR opened by `dependabot[bot]` runs with a read-only token even on a same-repo branch and is treated the same way. A 403 on a same-repo PR is a configuration failure (missing `pull-requests: write`): fail the step and say exactly what to add. `pull_request_target` is never recommended.
13. **action.yml surface:** inputs `schema` (required), `fail-on` (default `breaking`), `github-token` (default `${{ github.token }}`). Outputs `breaking-count`, `dangerous-count`, `safe-count`. No `comment` switch, no base/head override, no `format` input, no `report` output. README snippet runs on every `pull_request` with no `paths:` filter, because a path filter plus a required check leaves non-schema PRs stuck on "expected". `paths:` is mentioned as an option with that caveat.
14. **Name:** Cambium. Marketplace `name:` is "Cambium: GraphQL schema diff" because single-word names collide with GitHub users and orgs. Repo to be renamed `cambium` (GitHub redirects the old name). Rejected: Graft (hard collision), Treering (trademark and org), Understory (soft collision, wrong hierarchy). (ADR-0005)
15. **Done for v1:**
    - Shipped: `uses: larssondaniel/cambium@v1` works in a fresh repo with only the README snippet; Marketplace listing under "Code review" with branding; `v1.0.0` released, `v1` tag moved; MIT licence, README, CHANGELOG.
    - Behaves: decisions 1 to 13 implemented.
    - Proven: repo dogfoods itself on a fixture schema so the README screenshot is a real comment; renderer snapshot tests over a fixture set covering every headline and section combination; one fixture pair per change kind, graphql-js's and ours, driven through the run seam and asserting the rendered line; the GitHub port is exercised through the run seam with an in-memory fake (merge-base, both fetches, sticky find-or-update, fork skip, 403); the real Octokit adapter is thin and proven by dogfooding, not unit-tested; CI runs build, test, lint, check-dist.
    - Documented: 90-second README (one sentence, snippet, screenshot, inputs/outputs table, fork note, `paths:` caveat); ADRs 0001 to 0005; glossary; v2 log.
    - Implementation baseline, taken as idiomatic: actions/typescript-action template as-is (Node 24, ESM, Rollup to committed `dist/`, Jest 30).
    - Not v1: generate-at-head, label override, two-workflow fork mode, Canopy link, custom bot identity, logo or wordmark, any input beyond the three.
16. **One schema per step.** The sticky comment marker includes the schema path, so a team can add the step twice for two schemas and each run updates its own comment. A multi-schema single comment is v2.

## v2, 2026-10-24

Input to the v2 spec. Numbering continues from v1.

17. **The next release is the per-PR acknowledgement label, alone.** The test is v1's: the smallest thing a team already running Cambium would upgrade for. The label is the first wall a team hits once Cambium is a required check: a correct breaking change, such as removing a field after its deprecation sunset, can only pass by editing `fail-on` in the workflow, which either stays lowered or costs a second PR. The label is per PR, visible in the timeline and reviewer-owned, and it lives in the comment. It does not weaken the gate: on `pull_request` the workflow runs from the PR's own head, so an author could already lower `fail-on` inside the PR; the gate was always a visible convention, never a boundary against the author. The other six ideas stay in the log: generate-at-head reopens ADR-0001 and wins adopters, not upgrades; Open in Canopy is blocked outside this repo; two-workflow fork mode doubles the surface for public repos only; custom bot identity is docs, not a version; a logo is not a feature; two schemas already work as two steps.
