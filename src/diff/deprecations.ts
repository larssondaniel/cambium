import {
  isEnumType,
  isInputObjectType,
  isInterfaceType,
  isIntrospectionType,
  isObjectType,
  type GraphQLSchema
} from 'graphql'
import type { Change } from './change.js'
import { deprecationOf, resolvePath } from './schema-path.js'

/**
 * The one walk Cambium does itself: deprecations added, removed or reworded
 * on fields, arguments, input fields and enum values. graphql-js does not
 * report them, and they are always safe.
 */
export function findDeprecationChanges(
  base: GraphQLSchema,
  head: GraphQLSchema
): Change[] {
  const changes: Change[] = []
  for (const path of deprecatablePaths(head)) {
    // An element born deprecated is already reported as added by graphql-js.
    const inBase = resolvePath(base, path)
    if (!inBase) continue
    const before = deprecationOf(inBase)
    const after = deprecationOf(resolvePath(head, path))
    if (before === after) continue
    if (before === undefined) {
      changes.push({
        severity: 'safe',
        kind: 'DEPRECATION_ADDED',
        path,
        text: after
      })
    } else if (after === undefined) {
      changes.push({ severity: 'safe', kind: 'DEPRECATION_REMOVED', path })
    } else {
      changes.push({
        severity: 'safe',
        kind: 'DEPRECATION_REASON_CHANGED',
        path,
        before,
        after
      })
    }
  }
  return changes
}

/** Every schema path in a schema that `@deprecated` may apply to. */
function* deprecatablePaths(schema: GraphQLSchema): Generator<string> {
  for (const type of Object.values(schema.getTypeMap())) {
    if (isIntrospectionType(type)) continue
    if (isEnumType(type)) {
      for (const value of type.getValues()) yield `${type.name}.${value.name}`
    } else if (isInputObjectType(type)) {
      for (const field of Object.values(type.getFields()))
        yield `${type.name}.${field.name}`
    } else if (isObjectType(type) || isInterfaceType(type)) {
      for (const field of Object.values(type.getFields())) {
        yield `${type.name}.${field.name}`
        for (const arg of field.args)
          yield `${type.name}.${field.name}(${arg.name}:)`
      }
    }
  }
  for (const directive of schema.getDirectives()) {
    for (const arg of directive.args) yield `@${directive.name}(${arg.name}:)`
  }
}
