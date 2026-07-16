import { describe, expect, test } from 'vitest'
import {
  runtimeResponseSchemas,
  type RuntimeResponseSchemaName
} from '../src/schemas/serverResponses'
import {
  invalidRuntimeResponseFixtures,
  validRuntimeResponseFixtures
} from './fixtures/runtimeResponses'

const schemaNames = Object.keys(runtimeResponseSchemas) as RuntimeResponseSchemaName[]

describe('runtime response schema contracts', () => {
  test('has a valid and invalid fixture for every runtime schema', () => {
    expect(Object.keys(validRuntimeResponseFixtures).sort()).toEqual(
      [...schemaNames].sort()
    )
    expect(Object.keys(invalidRuntimeResponseFixtures).sort()).toEqual(
      [...schemaNames].sort()
    )
  })

  test.each(schemaNames)('%s accepts its valid response fixture', schemaName => {
    const schema = runtimeResponseSchemas[schemaName]
    const fixture = validRuntimeResponseFixtures[schemaName]

    expect(schema.is(fixture)).toBe(true)
    expect(schema.parse(fixture, `${schemaName} fixture`)).toBe(fixture)
  })

  test.each(schemaNames)('%s rejects its invalid response fixture', schemaName => {
    const schema = runtimeResponseSchemas[schemaName]
    const fixture = invalidRuntimeResponseFixtures[schemaName]

    expect(schema.is(fixture)).toBe(false)
    expect(() => schema.parse(fixture, `${schemaName} fixture`)).toThrow(
      `${schemaName} fixture has invalid data`
    )
  })
})
