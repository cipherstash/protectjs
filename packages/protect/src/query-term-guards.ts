import type {
  QueryTerm,
  ScalarQueryTerm,
  JsonPathQueryTerm,
  JsonContainsQueryTerm,
  JsonContainedByQueryTerm,
} from './types'

/**
 * Type guard for scalar query terms (have value + indexType)
 */
export function isScalarQueryTerm(term: QueryTerm): term is ScalarQueryTerm {
  return 'value' in term && 'indexType' in term
}

/**
 * Type guard for JSON path query terms (have path)
 */
export function isJsonPathQueryTerm(term: QueryTerm): term is JsonPathQueryTerm {
  return 'path' in term
}

/**
 * Type guard for JSON contains query terms (have contains)
 */
export function isJsonContainsQueryTerm(term: QueryTerm): term is JsonContainsQueryTerm {
  return 'contains' in term
}

/**
 * Type guard for JSON containedBy query terms (have containedBy)
 */
export function isJsonContainedByQueryTerm(term: QueryTerm): term is JsonContainedByQueryTerm {
  return 'containedBy' in term
}
