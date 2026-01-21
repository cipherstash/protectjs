import type { JsonPath } from '../../types'

/**
 * Converts a path to SteVec selector format: prefix/path/to/key
 */
export function pathToSelector(path: JsonPath, prefix: string): string {
  const pathArray = Array.isArray(path) ? path : path.split('.')
  return `${prefix}/${pathArray.join('/')}`
}

/**
 * Build a nested JSON object from a path array and a leaf value.
 * E.g., ['user', 'role'], 'admin' => { user: { role: 'admin' } }
 */
export function buildNestedObject(
  path: string[],
  value: unknown,
): Record<string, unknown> {
  if (path.length === 0) {
    return value as Record<string, unknown>
  }
  if (path.length === 1) {
    return { [path[0]]: value }
  }
  const [first, ...rest] = path
  return { [first]: buildNestedObject(rest, value) }
}

/**
 * Flattens nested JSON into path-value pairs for containment queries.
 * Returns the selector and a JSON object containing the value at the path.
 */
export function flattenJson(
  obj: Record<string, unknown>,
  prefix: string,
  currentPath: string[] = [],
): Array<{ selector: string; value: Record<string, unknown> }> {
  const results: Array<{ selector: string; value: Record<string, unknown> }> =
    []

  for (const [key, value] of Object.entries(obj)) {
    const newPath = [...currentPath, key]

    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      results.push(
        ...flattenJson(value as Record<string, unknown>, prefix, newPath),
      )
    } else {
      // Wrap the primitive value in a JSON object representing its path
      // This is needed because ste_vec_term expects JSON objects
      const wrappedValue = buildNestedObject(newPath, value)
      results.push({
        selector: `${prefix}/${newPath.join('/')}`,
        value: wrappedValue,
      })
    }
  }

  return results
}
