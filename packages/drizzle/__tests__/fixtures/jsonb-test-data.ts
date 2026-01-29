/**
 * JSONB Test Data Fixtures
 *
 * Shared test data matching the proxy test patterns for JSONB operations.
 * These fixtures ensure consistency between Drizzle integration tests and
 * the proxy reference tests.
 */

/**
 * Standard JSONB test data structure
 * Matches the proxy test data: {"string": "hello", "number": 42, ...}
 */
export const standardJsonbData = {
  string: 'hello',
  number: 42,
  array_string: ['hello', 'world'],
  array_number: [42, 84],
  nested: {
    number: 1815,
    string: 'world',
  },
}

/**
 * Type definition for standard JSONB data
 */
export type StandardJsonbData = typeof standardJsonbData

/**
 * Comparison test data (5 rows)
 * Used for testing WHERE clause comparisons with equality and range operations
 * Pattern: string A-E, number 1-5
 */
export const comparisonTestData = [
  { string: 'A', number: 1 },
  { string: 'B', number: 2 },
  { string: 'C', number: 3 },
  { string: 'D', number: 4 },
  { string: 'E', number: 5 },
]

/**
 * Type definition for comparison test data
 */
export type ComparisonTestData = (typeof comparisonTestData)[number]

/**
 * Large dataset generator for containment index tests
 * Creates N rows following the proxy pattern:
 * { id: 1000000 + n, string: "value_" + (n % 10), number: n % 10 }
 *
 * @param count - Number of records to generate (default 500)
 * @returns Array of test records
 */
export function generateLargeDataset(count = 500): Array<{
  id: number
  string: string
  number: number
}> {
  return Array.from({ length: count }, (_, n) => ({
    id: 1000000 + n,
    string: `value_${n % 10}`,
    number: n % 10,
  }))
}

/**
 * Extended JSONB data with additional fields for comprehensive testing
 * Includes all standard fields plus edge cases
 */
export const extendedJsonbData = {
  ...standardJsonbData,
  // Additional fields for edge case testing
  boolean_field: true,
  null_field: null,
  float_field: 99.99,
  negative_number: -500,
  empty_array: [],
  empty_object: {},
  deep_nested: {
    level1: {
      level2: {
        level3: {
          value: 'deep',
        },
      },
    },
  },
  unicode_string: '你好世界 🌍',
  special_chars: 'Hello "world" with \'quotes\'',
}

/**
 * Type definition for extended JSONB data
 */
export type ExtendedJsonbData = typeof extendedJsonbData

/**
 * JSONB data variations for containment tests
 * Each object represents a different containment pattern
 */
export const containmentVariations = {
  // String field containment
  stringOnly: { string: 'hello' },
  // Number field containment
  numberOnly: { number: 42 },
  // Array containment
  stringArray: { array_string: ['hello', 'world'] },
  numberArray: { array_number: [42, 84] },
  // Nested object containment
  nestedFull: { nested: { number: 1815, string: 'world' } },
  nestedPartial: { nested: { string: 'world' } },
  // Multiple field containment
  multipleFields: { string: 'hello', number: 42 },
}

/**
 * Path test cases for field access and path operations
 * Maps path expressions to expected values from standardJsonbData
 */
export const pathTestCases = {
  // Simple paths
  string: 'hello',
  number: 42,
  // Array paths
  array_string: ['hello', 'world'],
  array_number: [42, 84],
  // Nested paths
  nested: { number: 1815, string: 'world' },
  'nested.string': 'world',
  'nested.number': 1815,
  // Unknown paths (should return null/empty)
  unknown_field: null,
  'nested.unknown': null,
}

/**
 * Array wildcard test cases
 * Tests $.array[*] and $.array[@] patterns
 */
export const arrayWildcardTestCases = {
  'array_string[*]': ['hello', 'world'],
  'array_string[@]': ['hello', 'world'],
  'array_number[*]': [42, 84],
  'array_number[@]': [42, 84],
}

/**
 * Helper to create a unique test run ID for isolating test data
 */
export function createTestRunId(prefix = 'jsonb-test'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}
