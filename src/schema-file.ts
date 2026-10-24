import {
  buildClientSchema,
  buildSchema,
  printSchema,
  type GraphQLSchema,
  type IntrospectionQuery
} from 'graphql'

/** Which commit a schema file was read at, for error messages. */
export interface SchemaOrigin {
  /** Which schema the file is: the base schema (at the merge-base) or the head schema. */
  label: 'base' | 'head'
  sha: string
}

/** A schema file that could not be turned into a schema. */
export class SchemaFileError extends Error {
  constructor(
    readonly path: string,
    readonly origin: SchemaOrigin,
    cause: Error
  ) {
    super(
      `Could not parse the ${origin.label} schema, \`${path}\` at ${shortSha(origin.sha)}: ${cause.message}`,
      { cause }
    )
    this.name = 'SchemaFileError'
  }
}

/**
 * Builds a schema from the text of a schema file. The format is detected by
 * content: a first non-whitespace `{` means introspection JSON, anything else
 * is SDL.
 */
export function loadSchema(
  text: string,
  path: string,
  origin: SchemaOrigin
): GraphQLSchema {
  try {
    return isIntrospectionJson(text)
      ? fromIntrospection(parseIntrospection(text))
      : buildSchema(text)
  } catch (error) {
    throw new SchemaFileError(path, origin, toError(error))
  }
}

/**
 * Builds the schema and round-trips it through SDL, so that an introspection
 * result compares equal to the same schema read from SDL: introspection
 * carries `null` where SDL has no description, and graphql-js would otherwise
 * report every undescribed element as a description change.
 */
function fromIntrospection(introspection: IntrospectionQuery): GraphQLSchema {
  return buildSchema(printSchema(buildClientSchema(introspection)))
}

function isIntrospectionJson(text: string): boolean {
  return text.trimStart().startsWith('{')
}

/** Accepts both the bare `{ __schema }` shape and the `{ data: { __schema } }` shape. */
function parseIntrospection(text: string): IntrospectionQuery {
  const parsed: unknown = JSON.parse(text)
  const candidate = hasKey(parsed, 'data') ? parsed.data : parsed
  if (!hasKey(candidate, '__schema')) {
    throw new Error(
      'Introspection JSON has no `__schema` key, neither at the top level nor under `data`'
    )
  }
  return candidate as IntrospectionQuery
}

function hasKey<K extends string>(
  value: unknown,
  key: K
): value is Record<K, unknown> {
  return typeof value === 'object' && value !== null && key in value
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}

export function shortSha(sha: string): string {
  return sha.slice(0, 7)
}
