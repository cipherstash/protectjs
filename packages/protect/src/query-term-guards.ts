import type {
  JsonContainedByQueryTerm,
  JsonContainsQueryTerm,
  JsonPathQueryTerm,
  QueryTerm,
  ScalarQueryTerm,
} from './types'

/**
 * Type guard for scalar query terms.
 * Scalar terms have 'value' but not JSON-specific properties (path, contains, containedBy).
 * Note: indexType is now optional for scalar terms (auto-inferred when omitted).
 */
export function isScalarQueryTerm(term: QueryTerm): term is ScalarQueryTerm {
  return (
    'value' in term &&
    !('path' in term) &&
    !('contains' in term) &&
    !('containedBy' in term)
  )
}

/**
 * Type guard for JSON path query terms (have path)
 */
export function isJsonPathQueryTerm(
  term: QueryTerm,
): term is JsonPathQueryTerm {
  return 'path' in term
}

/**
 * Type guard for JSON contains query terms (have contains)
 */
export function isJsonContainsQueryTerm(
  term: QueryTerm,
): term is JsonContainsQueryTerm {
  return 'contains' in term
}

/**
 * Type guard for JSON containedBy query terms (have containedBy)
 */
export function isJsonContainedByQueryTerm(
  term: QueryTerm,
): term is JsonContainedByQueryTerm {
  return 'containedBy' in term
}

/**
 * Type guard to check if an array contains QueryTerm objects.
 * Checks for QueryTerm-specific properties (column/table) to distinguish
 * from JsPlaintext[] which can also be an array of objects.
 */
export function isQueryTermArray(
  arr: readonly unknown[],
): arr is readonly QueryTerm[] {
  return (
    arr.length > 0 &&
    typeof arr[0] === 'object' &&
    arr[0] !== null &&
    ('column' in arr[0] || 'table' in arr[0])
  )
}
