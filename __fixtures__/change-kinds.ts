/**
 * One fixture pair per change kind, with the line Cambium is expected to
 * render for it. Breaking and dangerous kinds are graphql-js's; the safe
 * kinds are graphql-js's plus Cambium's deprecation kinds.
 */
export interface ChangeKindFixture {
  kind: string
  base: string
  head: string
  /** The rendered line, without the list marker. */
  line: string
  /** Expected counts: breaking, dangerous, safe. */
  counts: [number, number, number]
}

const QUERY = 'type Query { ok: Boolean }'

export const BREAKING_KINDS: ChangeKindFixture[] = [
  {
    kind: 'TYPE_REMOVED',
    base: `${QUERY} type Gone { x: Boolean }`,
    head: QUERY,
    line: '`Gone` type removed',
    counts: [1, 0, 0]
  },
  {
    kind: 'TYPE_REMOVED (built-in scalar no longer referenced)',
    base: 'type Query { a: Float }',
    head: 'type Query { a: String }',
    line: '`Float` built-in scalar removed, no longer referenced',
    counts: [2, 0, 0]
  },
  {
    kind: 'TYPE_CHANGED_KIND',
    base: `${QUERY} type Thing { x: Int }`,
    head: `${QUERY} interface Thing { x: Int }`,
    line: '`Thing` changed from object type to interface type',
    counts: [1, 0, 0]
  },
  {
    kind: 'TYPE_REMOVED_FROM_UNION',
    base: 'type Query { r: Result } type A { x: Int } type B { y: Int } union Result = A | B',
    head: 'type Query { r: Result } type A { x: Int } type B { y: Int } union Result = A',
    line: '`Result` union member `B` removed',
    counts: [1, 0, 0]
  },
  {
    kind: 'VALUE_REMOVED_FROM_ENUM',
    base: 'enum Role { ADMIN USER }',
    head: 'enum Role { ADMIN }',
    line: '`Role.USER` removed from enum',
    counts: [1, 0, 0]
  },
  {
    kind: 'REQUIRED_INPUT_FIELD_ADDED',
    base: 'input CreateUserInput { name: String }',
    head: 'input CreateUserInput { name: String, email: String! }',
    line: '`CreateUserInput.email` required input field added',
    counts: [1, 0, 0]
  },
  {
    kind: 'IMPLEMENTED_INTERFACE_REMOVED',
    base: 'interface Node { id: ID! } type User implements Node { id: ID! }',
    head: 'interface Node { id: ID! } type User { id: ID! }',
    line: '`User` no longer implements `Node`',
    counts: [1, 0, 0]
  },
  {
    kind: 'FIELD_REMOVED',
    base: 'type User { id: ID! email: String }',
    head: 'type User { id: ID! }',
    line: '`User.email` removed',
    counts: [1, 0, 0]
  },
  {
    kind: 'FIELD_CHANGED_KIND',
    base: 'type User { email: String! }',
    head: 'type User { email: String }',
    line: '`User.email` changed type from `String!` to `String`',
    counts: [1, 0, 0]
  },
  {
    kind: 'REQUIRED_ARG_ADDED',
    base: 'type Query { search(term: String): String }',
    head: 'type Query { search(term: String, limit: String!): String }',
    line: '`Query.search(limit:)` required argument added',
    counts: [1, 0, 0]
  },
  {
    kind: 'ARG_REMOVED',
    base: 'type Query { search(term: String, sort: String): String }',
    head: 'type Query { search(term: String): String }',
    line: '`Query.search(sort:)` removed',
    counts: [1, 0, 0]
  },
  {
    kind: 'ARG_CHANGED_KIND',
    base: 'type Query { search(limit: Int): String }',
    head: 'type Query { search(limit: Int!): String }',
    line: '`Query.search(limit:)` changed type from `Int` to `Int!`',
    counts: [1, 0, 0]
  },
  {
    kind: 'DIRECTIVE_REMOVED',
    base: `${QUERY} directive @auth on FIELD_DEFINITION`,
    head: QUERY,
    line: '`@auth` directive removed',
    counts: [1, 0, 0]
  },
  {
    kind: 'DIRECTIVE_ARG_REMOVED',
    base: `${QUERY} directive @auth(role: String) on FIELD_DEFINITION`,
    head: `${QUERY} directive @auth on FIELD_DEFINITION`,
    line: '`@auth(role:)` removed',
    counts: [1, 0, 0]
  },
  {
    kind: 'REQUIRED_DIRECTIVE_ARG_ADDED',
    base: `${QUERY} directive @auth on FIELD_DEFINITION`,
    head: `${QUERY} directive @auth(role: String!) on FIELD_DEFINITION`,
    line: '`@auth(role:)` required argument added',
    counts: [1, 0, 0]
  },
  {
    kind: 'DIRECTIVE_REPEATABLE_REMOVED',
    base: `${QUERY} directive @tag repeatable on FIELD_DEFINITION`,
    head: `${QUERY} directive @tag on FIELD_DEFINITION`,
    line: '`@tag` no longer repeatable',
    counts: [1, 0, 0]
  },
  {
    kind: 'DIRECTIVE_LOCATION_REMOVED',
    base: `${QUERY} directive @tag on FIELD_DEFINITION | OBJECT`,
    head: `${QUERY} directive @tag on FIELD_DEFINITION`,
    line: '`@tag` no longer allowed on `OBJECT`',
    counts: [1, 0, 0]
  }
]

export const DANGEROUS_KINDS: ChangeKindFixture[] = [
  {
    kind: 'VALUE_ADDED_TO_ENUM',
    base: 'enum OrderStatus { PAID }',
    head: 'enum OrderStatus { PAID REFUNDED }',
    line: '`OrderStatus.REFUNDED` added to enum',
    counts: [0, 1, 0]
  },
  {
    kind: 'TYPE_ADDED_TO_UNION',
    base: 'type Query { r: Result } type A { x: Int } type B { y: Int } union Result = A',
    head: 'type Query { r: Result } type A { x: Int } type B { y: Int } union Result = A | B',
    line: '`Result` union member `B` added',
    counts: [0, 1, 0]
  },
  {
    kind: 'OPTIONAL_INPUT_FIELD_ADDED',
    base: 'input CreateUserInput { name: String }',
    head: 'input CreateUserInput { name: String, nickname: String }',
    line: '`CreateUserInput.nickname` optional input field added',
    counts: [0, 1, 0]
  },
  {
    kind: 'OPTIONAL_ARG_ADDED',
    base: 'type Query { search(term: String): String }',
    head: 'type Query { search(term: String, sort: String): String }',
    line: '`Query.search(sort:)` optional argument added',
    counts: [0, 1, 0]
  },
  {
    kind: 'IMPLEMENTED_INTERFACE_ADDED',
    base: 'interface Node { id: ID! } type User { id: ID! }',
    head: 'interface Node { id: ID! } type User implements Node { id: ID! }',
    line: '`User` now implements `Node`',
    counts: [0, 1, 0]
  },
  {
    kind: 'ARG_DEFAULT_VALUE_CHANGE (changed)',
    base: 'type Query { search(limit: Int = 10): String }',
    head: 'type Query { search(limit: Int = 20): String }',
    line: '`Query.search(limit:)` default changed from `10` to `20`',
    counts: [0, 1, 0]
  },
  {
    kind: 'ARG_DEFAULT_VALUE_CHANGE (removed)',
    base: 'type Query { search(limit: Int = 10): String }',
    head: 'type Query { search(limit: Int): String }',
    line: '`Query.search(limit:)` default `10` removed',
    counts: [0, 1, 0]
  },
  {
    kind: 'ARG_DEFAULT_VALUE_CHANGE (object literal with spaces)',
    base: 'input Filter { a: Int, b: String } type Query { search(filter: Filter = { a: 1 }): String }',
    head: 'input Filter { a: Int, b: String } type Query { search(filter: Filter = { a: 1, b: "x y" }): String }',
    line: '`Query.search(filter:)` default changed from `{ a: 1 }` to `{ a: 1, b: "x y" }`',
    counts: [0, 1, 0]
  },
  {
    kind: 'INPUT_FIELD_DEFAULT_VALUE_CHANGE',
    base: 'input Filter { limit: Int = 1 }',
    head: 'input Filter { limit: Int = 2 }',
    line: '`Filter.limit` default changed from `1` to `2`',
    counts: [0, 1, 0]
  }
]

export const SAFE_KINDS: ChangeKindFixture[] = [
  {
    kind: 'DESCRIPTION_CHANGED (type)',
    base: 'type User { id: ID! }',
    head: '"""A person with an account.""" type User { id: ID! }',
    line: '`User` description added: "A person with an account."',
    counts: [0, 0, 1]
  },
  {
    kind: 'DESCRIPTION_CHANGED (field)',
    base: 'type User { "Old" id: ID! }',
    head: 'type User { "Stable across renames" id: ID! }',
    line: '`User.id` description changed from "Old" to "Stable across renames"',
    counts: [0, 0, 1]
  },
  {
    kind: 'DESCRIPTION_CHANGED (removed)',
    base: 'type User { "Old" id: ID! }',
    head: 'type User { id: ID! }',
    line: '`User.id` description "Old" removed',
    counts: [0, 0, 1]
  },
  {
    kind: 'DESCRIPTION_CHANGED (enum value)',
    base: 'enum Role { ADMIN }',
    head: 'enum Role { "Can do anything" ADMIN }',
    line: '`Role.ADMIN` description added: "Can do anything"',
    counts: [0, 0, 1]
  },
  {
    kind: 'DESCRIPTION_CHANGED (input field)',
    base: 'input Filter { limit: Int }',
    head: 'input Filter { "Page size" limit: Int }',
    line: '`Filter.limit` description added: "Page size"',
    counts: [0, 0, 1]
  },
  {
    kind: 'DESCRIPTION_CHANGED (argument)',
    base: 'type Query { search(term: String): String }',
    head: 'type Query { search("Free text" term: String): String }',
    line: '`Query.search(term:)` description added: "Free text"',
    counts: [0, 0, 1]
  },
  {
    kind: 'DESCRIPTION_CHANGED (directive)',
    base: `${QUERY} directive @auth on FIELD_DEFINITION`,
    head: `${QUERY} "Requires a signed-in user" directive @auth on FIELD_DEFINITION`,
    line: '`@auth` description added: "Requires a signed-in user"',
    counts: [0, 0, 1]
  },
  {
    kind: 'DESCRIPTION_CHANGED (directive argument)',
    base: `${QUERY} directive @auth(role: String) on FIELD_DEFINITION`,
    head: `${QUERY} directive @auth("Role name" role: String) on FIELD_DEFINITION`,
    line: '`@auth(role:)` description added: "Role name"',
    counts: [0, 0, 1]
  },
  {
    kind: 'DESCRIPTION_CHANGED (long, multi-line)',
    base: 'type User { id: ID! }',
    head: `"""
    The identifier of the user. It is stable across renames, merges and
    migrations, so clients may cache by it indefinitely without risk.
    """
    type User { id: ID! }`,
    line: '`User` description added: "The identifier of the user. It is stable across renames, merges and migrations…"',
    counts: [0, 0, 1]
  },
  {
    kind: 'TYPE_ADDED (object)',
    base: QUERY,
    head: `${QUERY} type Invoice { paid: Boolean }`,
    line: '`Invoice` type added',
    counts: [0, 0, 1]
  },
  {
    kind: 'TYPE_ADDED (enum)',
    base: QUERY,
    head: `${QUERY} enum Role { ADMIN }`,
    line: '`Role` enum added',
    counts: [0, 0, 1]
  },
  {
    kind: 'TYPE_ADDED (interface)',
    base: QUERY,
    head: `${QUERY} interface Node { ok: Boolean }`,
    line: '`Node` interface added',
    counts: [0, 0, 1]
  },
  {
    kind: 'TYPE_ADDED (union)',
    base: `${QUERY} type A { x: Int }`,
    head: `${QUERY} type A { x: Int } union Result = A`,
    line: '`Result` union added',
    counts: [0, 0, 1]
  },
  {
    kind: 'TYPE_ADDED (input type)',
    base: QUERY,
    head: `${QUERY} input Filter { enabled: Boolean }`,
    line: '`Filter` input type added',
    counts: [0, 0, 1]
  },
  {
    kind: 'TYPE_ADDED (scalar)',
    base: QUERY,
    head: `${QUERY} scalar DateTime`,
    line: '`DateTime` scalar added',
    counts: [0, 0, 1]
  },
  {
    kind: 'TYPE_ADDED (built-in scalar now referenced)',
    base: 'type Query { a: String }',
    head: 'type Query { a: String, b: Int }',
    line: '`Int` built-in scalar added, now referenced',
    counts: [0, 0, 2]
  },
  {
    kind: 'DIRECTIVE_ADDED',
    base: QUERY,
    head: `${QUERY} directive @tag on FIELD_DEFINITION`,
    line: '`@tag` directive added',
    counts: [0, 0, 1]
  },
  {
    kind: 'FIELD_ADDED',
    base: 'type User { id: ID! }',
    head: 'type User { id: ID! phone: String }',
    line: '`User.phone` added',
    counts: [0, 0, 1]
  },
  {
    kind: 'DIRECTIVE_REPEATABLE_ADDED',
    base: `${QUERY} directive @tag on FIELD_DEFINITION`,
    head: `${QUERY} directive @tag repeatable on FIELD_DEFINITION`,
    line: '`@tag` now repeatable',
    counts: [0, 0, 1]
  },
  {
    kind: 'DIRECTIVE_LOCATION_ADDED',
    base: `${QUERY} directive @tag on FIELD_DEFINITION`,
    head: `${QUERY} directive @tag on FIELD_DEFINITION | OBJECT`,
    line: '`@tag` now allowed on `OBJECT`',
    counts: [0, 0, 1]
  },
  {
    kind: 'OPTIONAL_DIRECTIVE_ARG_ADDED',
    base: `${QUERY} directive @auth on FIELD_DEFINITION`,
    head: `${QUERY} directive @auth(role: String) on FIELD_DEFINITION`,
    line: '`@auth(role:)` optional argument added',
    counts: [0, 0, 1]
  },
  {
    kind: 'FIELD_CHANGED_KIND_SAFE',
    base: 'type User { email: String }',
    head: 'type User { email: String! }',
    line: '`User.email` changed type from `String` to `String!`',
    counts: [0, 0, 1]
  },
  {
    kind: 'ARG_CHANGED_KIND_SAFE',
    base: 'type Query { search(limit: Int!): String }',
    head: 'type Query { search(limit: Int): String }',
    line: '`Query.search(limit:)` changed type from `Int!` to `Int`',
    counts: [0, 0, 1]
  },
  {
    kind: 'ARG_DEFAULT_VALUE_ADDED',
    base: 'type Query { search(limit: Int): String }',
    head: 'type Query { search(limit: Int = 10): String }',
    line: '`Query.search(limit:)` default `10` added',
    counts: [0, 0, 1]
  },
  {
    kind: 'INPUT_FIELD_DEFAULT_VALUE_ADDED',
    base: 'input Filter { limit: Int }',
    head: 'input Filter { limit: Int = 1 }',
    line: '`Filter.limit` default `1` added',
    counts: [0, 0, 1]
  },
  {
    kind: 'DEPRECATION_ADDED (field, with reason)',
    base: 'type User { contact: String }',
    head: 'type User { contact: String @deprecated(reason: "Use `User.contact.email`") }',
    line: '`User.contact` deprecated: "Use \\`User.contact.email\\`"',
    counts: [0, 0, 1]
  },
  {
    kind: 'DEPRECATION_ADDED (field, default reason)',
    base: 'type User { contact: String }',
    head: 'type User { contact: String @deprecated }',
    line: '`User.contact` deprecated: "No longer supported"',
    counts: [0, 0, 1]
  },
  {
    kind: 'DEPRECATION_ADDED (enum value)',
    base: 'enum Role { ADMIN GUEST }',
    head: 'enum Role { ADMIN GUEST @deprecated(reason: "Guests are users now") }',
    line: '`Role.GUEST` deprecated: "Guests are users now"',
    counts: [0, 0, 1]
  },
  {
    kind: 'DEPRECATION_ADDED (argument)',
    base: 'type Query { search(term: String, sort: String): String }',
    head: 'type Query { search(term: String, sort: String @deprecated(reason: "Results are ranked")): String }',
    line: '`Query.search(sort:)` deprecated: "Results are ranked"',
    counts: [0, 0, 1]
  },
  {
    kind: 'DEPRECATION_ADDED (input field)',
    base: 'input Filter { limit: Int }',
    head: 'input Filter { limit: Int @deprecated(reason: "Use `first`") }',
    line: '`Filter.limit` deprecated: "Use \\`first\\`"',
    counts: [0, 0, 1]
  },
  {
    kind: 'DEPRECATION_REMOVED',
    base: 'type User { contact: String @deprecated(reason: "Gone soon") }',
    head: 'type User { contact: String }',
    line: '`User.contact` no longer deprecated',
    counts: [0, 0, 1]
  },
  {
    kind: 'DEPRECATION_REASON_CHANGED',
    base: 'type User { contact: String @deprecated(reason: "Gone soon") }',
    head: 'type User { contact: String @deprecated(reason: "Use `User.email`") }',
    line: '`User.contact` deprecation reason changed from "Gone soon" to "Use \\`User.email\\`"',
    counts: [0, 0, 1]
  }
]
