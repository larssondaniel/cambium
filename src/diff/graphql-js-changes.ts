import {
  findSchemaChanges,
  isSpecifiedScalarType,
  type GraphQLSchema
} from 'graphql'
import { severityOf, type Change, type ChangeKind } from './change.js'
import {
  defaultOf,
  descriptionOf,
  resolvePath,
  typeKindWord
} from './schema-path.js'

/**
 * Reads graphql-js's schema changes into Cambium's change model.
 *
 * graphql-js reports each change as a kind plus one English sentence. The kind
 * decides the severity and is never second-guessed. The sentence names the
 * schema path, which these readers extract; values that changed are then read
 * from the two schemas rather than from the sentence, because sentences are
 * for people.
 */
export function readGraphqlJsChanges(
  base: GraphQLSchema,
  head: GraphQLSchema
): Change[] {
  const schemas = new Schemas(base, head)
  return findSchemaChanges(base, head).map(({ type, description }) => {
    const kind = type as ChangeKind
    const read = READERS[kind]?.(description, schemas)
    return read
      ? { severity: severityOf(kind), kind, ...read }
      : {
          severity: severityOf(kind),
          kind: 'UNRECOGNIZED',
          path: '',
          description
        }
  })
}

type Reader = (
  description: string,
  schemas: Schemas
) => Omit<Change, 'severity' | 'kind'> | undefined

/** The two schemas a reader looks values up in, plus the one piece of state a reader needs. */
class Schemas {
  private readonly directiveArgumentsSeen = new Map<string, number>()

  constructor(
    readonly base: GraphQLSchema,
    readonly head: GraphQLSchema
  ) {}

  /**
   * graphql-js names a directive argument whose description changed as
   * `@tag(tag)`, losing the argument. It reports those arguments in the base
   * directive's argument order, so the n-th such sentence for a directive is
   * its n-th argument with a changed description.
   */
  nextChangedDirectiveArgument(directive: string): string | undefined {
    const baseArgs = this.base.getDirective(directive)?.args ?? []
    const headArgs = this.head.getDirective(directive)?.args ?? []
    const changed = baseArgs
      .filter((arg) => {
        const headArg = headArgs.find((a) => a.name === arg.name)
        return headArg && descriptionOf(arg) !== descriptionOf(headArg)
      })
      .map((arg) => arg.name)
    const seen = this.directiveArgumentsSeen.get(directive) ?? 0
    this.directiveArgumentsSeen.set(directive, seen + 1)
    return changed[seen]
  }
}

const NAME = String.raw`(\S+?)`

/** Builds a reader whose sentence names only the schema path. */
function pathOnly(pattern: string): Reader {
  const regex = new RegExp(`^${pattern}\\.$`)
  return (description) => {
    const match = regex.exec(description)
    return match ? { path: match[1] } : undefined
  }
}

/** Builds a reader whose sentence names the schema path and a second subject. */
function withSubject(
  pattern: string,
  order: 'path-first' | 'subject-first'
): Reader {
  const regex = new RegExp(`^${pattern}\\.$`)
  return (description) => {
    const match = regex.exec(description)
    if (!match) return undefined
    const [, first, second] = match
    return order === 'path-first'
      ? { path: first, subject: second }
      : { path: second, subject: first }
  }
}

/** Type changes name the before and after types in the sentence; types contain no spaces. */
function typeChanged(pattern: string): Reader {
  const regex = new RegExp(
    `^${pattern} (?:has )?changed type from ${NAME} to ${NAME}\\.$`
  )
  return (description) => {
    const match = regex.exec(description)
    if (!match) return undefined
    const [, path, before, after] = match
    return { path, before, after }
  }
}

/** Default values can contain spaces, so they are read from the schemas, not the sentence. */
const defaultChanged: Reader = (description, { base, head }) => {
  const match =
    /^(\S+?) (?:defaultValue was removed|has changed defaultValue from .* to .*|added a defaultValue .*)\.$/.exec(
      description
    )
  if (!match) return undefined
  const path = match[1]
  return {
    path,
    before: defaultOf(resolvePath(base, path)),
    after: defaultOf(resolvePath(head, path))
  }
}

/**
 * Descriptions are read from the head schema rather than the sentence: the
 * sentence prints a removed description as the word "undefined", and names a
 * directive argument by its directive's name twice (`@tag(tag)`).
 */
const descriptionChanged: Reader = (description, schemas) => {
  const match =
    /^Description of (?:field |input-field |enum value |argument )?(\S+?) has changed to /.exec(
      description
    )
  if (!match) return undefined
  const path = repairDirectiveArgumentPath(match[1], schemas)
  return {
    path,
    before: descriptionOf(resolvePath(schemas.base, path)),
    after: descriptionOf(resolvePath(schemas.head, path))
  }
}

function repairDirectiveArgumentPath(path: string, schemas: Schemas): string {
  const match = /^@(\w+)\(\1\)$/.exec(path)
  if (!match) return path
  const directive = match[1]
  const argument = schemas.nextChangedDirectiveArgument(directive)
  return argument ? `@${directive}(${argument}:)` : `@${directive}`
}

const typeChangedKind: Reader = (description) => {
  const match = /^(\S+?) changed from an? (\w+) type to an? (\w+) type\.$/.exec(
    description
  )
  if (!match) return undefined
  const [, path, before, after] = match
  return { path, before: before.toLowerCase(), after: after.toLowerCase() }
}

const typeRemoved: Reader = (description, { base }) => {
  const match =
    /^(Standard scalar )?(\S+?) was removed(?: because it is not referenced anymore)?\.$/.exec(
      description
    )
  if (!match) return undefined
  const path = match[2]
  return {
    path,
    subject: match[1]
      ? 'built-in scalar'
      : typeKindWord(base.getType(path) ?? undefined)
  }
}

const typeAdded: Reader = (description, { head }) => {
  const match = /^(\S+?) was added\.$/.exec(description)
  if (!match) return undefined
  const path = match[1]
  const type = head.getType(path) ?? undefined
  return {
    path,
    subject:
      type && isSpecifiedScalarType(type)
        ? 'built-in scalar'
        : typeKindWord(type)
  }
}

const READERS: Partial<Record<ChangeKind, Reader>> = {
  // Breaking
  TYPE_REMOVED: typeRemoved,
  TYPE_CHANGED_KIND: typeChangedKind,
  TYPE_REMOVED_FROM_UNION: withSubject(
    `${NAME} was removed from union type ${NAME}`,
    'subject-first'
  ),
  VALUE_REMOVED_FROM_ENUM: pathOnly(`Enum value ${NAME} was removed`),
  REQUIRED_INPUT_FIELD_ADDED: pathOnly(`A required field ${NAME} was added`),
  IMPLEMENTED_INTERFACE_REMOVED: withSubject(
    `${NAME} no longer implements interface ${NAME}`,
    'path-first'
  ),
  FIELD_REMOVED: pathOnly(`Field ${NAME} was removed`),
  FIELD_CHANGED_KIND: typeChanged(`Field ${NAME}`),
  REQUIRED_ARG_ADDED: pathOnly(`A required argument ${NAME} was added`),
  ARG_REMOVED: pathOnly(`Argument ${NAME} was removed`),
  ARG_CHANGED_KIND: typeChanged(`Argument ${NAME}`),
  DIRECTIVE_REMOVED: pathOnly(`Directive ${NAME} was removed`),
  DIRECTIVE_ARG_REMOVED: pathOnly(`Argument ${NAME} was removed`),
  REQUIRED_DIRECTIVE_ARG_ADDED: pathOnly(
    `A required argument ${NAME} was added`
  ),
  DIRECTIVE_REPEATABLE_REMOVED: pathOnly(
    `Repeatable flag was removed from ${NAME}`
  ),
  DIRECTIVE_LOCATION_REMOVED: withSubject(
    `${NAME} was removed from ${NAME}`,
    'subject-first'
  ),
  // Dangerous
  VALUE_ADDED_TO_ENUM: pathOnly(`Enum value ${NAME} was added`),
  TYPE_ADDED_TO_UNION: withSubject(
    `${NAME} was added to union type ${NAME}`,
    'subject-first'
  ),
  OPTIONAL_INPUT_FIELD_ADDED: pathOnly(`An optional field ${NAME} was added`),
  OPTIONAL_ARG_ADDED: pathOnly(`An optional argument ${NAME} was added`),
  IMPLEMENTED_INTERFACE_ADDED: withSubject(
    `${NAME} added to interfaces implemented by ${NAME}`,
    'subject-first'
  ),
  ARG_DEFAULT_VALUE_CHANGE: defaultChanged,
  INPUT_FIELD_DEFAULT_VALUE_CHANGE: defaultChanged,
  // Safe
  DESCRIPTION_CHANGED: descriptionChanged,
  TYPE_ADDED: typeAdded,
  DIRECTIVE_ADDED: pathOnly(`Directive ${NAME} was added`),
  FIELD_ADDED: pathOnly(`Field ${NAME} was added`),
  DIRECTIVE_REPEATABLE_ADDED: pathOnly(`Repeatable flag was added to ${NAME}`),
  DIRECTIVE_LOCATION_ADDED: withSubject(
    `${NAME} was added to ${NAME}`,
    'subject-first'
  ),
  OPTIONAL_DIRECTIVE_ARG_ADDED: pathOnly(
    `An optional argument ${NAME} was added`
  ),
  FIELD_CHANGED_KIND_SAFE: typeChanged(`Field ${NAME}`),
  ARG_CHANGED_KIND_SAFE: typeChanged(`Argument ${NAME}`),
  ARG_DEFAULT_VALUE_ADDED: defaultChanged,
  INPUT_FIELD_DEFAULT_VALUE_ADDED: defaultChanged
}
