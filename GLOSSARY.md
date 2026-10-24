# Cambium

Cambium is a GitHub Action that compares a GraphQL schema between a pull request's base and head, classifies each change, and reports the result in one PR comment.

## Language

**Schema file**:
The file in the repository that holds the GraphQL schema the action diffs. It is a committed artifact; the action never generates it.
_Avoid_: schema artifact, schema source, endpoint

**Base schema**:
The schema file as it exists at the merge-base of the pull request: the last commit the PR branch and its target branch share. Not the target branch's tip.
_Avoid_: old schema, before, main schema, base branch schema

**Head schema**:
The schema file as it exists at the pull request's head ref (the PR's latest commit).
_Avoid_: new schema, after, PR schema

## Changes

**Change**:
One difference between the base schema and the head schema, at the granularity of a type, field, argument, enum value, union member, interface implementation or directive.
_Avoid_: diff entry, delta, modification

**Breaking change**:
A change that can make an existing, valid client operation fail. The catalogue is graphql-js's.
_Avoid_: critical, error, major

**Dangerous change**:
A change that keeps existing operations valid but can change their runtime behaviour or returned values, such as a new enum value an old client cannot handle. The catalogue is graphql-js's.
_Avoid_: warning, risky, minor

**Safe change**:
Any change that is neither breaking nor dangerous: additions, description edits, deprecation markers.
_Avoid_: non-breaking, harmless, info, patch

**Severity**:
The classification of a change as breaking, dangerous or safe.
_Avoid_: criticality, level, impact

## Reporting

**Verdict**:
The one-line judgement at the top of the comment, derived from the worst severity present.
_Avoid_: status, result, outcome, summary line

**Sticky comment**:
The single PR comment the action owns and updates on every run, found by a hidden marker in its body that names the schema path.
_Avoid_: bot comment, report, status comment

**Schema path**:
The dotted name that locates a change: `Type`, `Type.field`, `Type.field(arg:)`, `Enum.VALUE`, or `@directive`.
_Avoid_: coordinate, location, selector

## Gate

**Gate**:
The rule that fails the step when any change at or above the `fail-on` severity exists, so that Cambium can be a required check. The gate decides the step's outcome, never the report's content.
_Avoid_: threshold, policy, blocker, check rule

**Acceptance label**:
The label, named by the `accept-label` input and `schema-change-accepted` by default, that a person adds to a pull request so the gate passes for that pull request alone. It is read live on every run and remembered nowhere.
_Avoid_: override label, approval label, bypass label, skip label

**Accepted**:
The state of a run whose gate would fail but passes because the acceptance label is on the pull request. The verdict, counts and sections are unchanged; only the step's outcome is.
_Avoid_: approved, overridden, bypassed, skipped

**Gate line**:
The one sentence at the foot of the report, above the footer, that says what the check fails on and names the acceptance label, or says that the changes are accepted. Present only when the gate would fail.
_Avoid_: hint, call to action, footer note

## Naming

**Cambium**:
The project's name. In a tree, the cambium is the thin layer where each new ring forms; here it is the layer of growth between the base schema and the head schema.
_Avoid_: the action, schema-diff, the bot
