import type { JsonPath } from '../../types'

/**
 * Converts a path to SteVec selector format: prefix/path/to/key
 */
export function pathToSelector(path: JsonPath, prefix: string): string {
  const pathArray = Array.isArray(path) ? path : path.split('.')
  return `${prefix}/${pathArray.join('/')}`
}

/**
 * Converts a path to JSON Path format: $.path.to.key
 */
export function toDollarPath(path: JsonPath): string {
  const pathArray = Array.isArray(path) ? path : path.split('.')
  // Handle special characters in keys if needed, but for now simple dot notation or bracket notation
  // If keys contain dots or other special chars, they should be quoted in bracket notation
  // But standard ste_vec implementation might expect simple dot notation for now or handle quoting.
  // Let's assume simple dot notation is sufficient or keys are simple.
  // Actually, to be safe, maybe we should just join with dots.
  // But if a key is "a.b", dot join makes "a.b", which is 2 segments.
  // Valid JSON path should be $['a.b']
  // Let's try to construct a robust JSON path.
  // For now, let's use the simple implementation: $.a.b
  // The error message `expected root selector '$'` suggests it parses standard JSON path.
  
  // Update: Construct valid JSONPath.
  const selector = pathArray.map(seg => {
    if (/^[a-zA-Z0-9_]+$/.test(seg)) {
      return `.${seg}`
    }
    return `["${seg.replace(/"/g, '\\"')}"]`
  }).join('')
  
  return `\$${selector}`
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
): Array<{ selector: string; value: Record<string, unknown>; path: string[] }> {
  const results: Array<{ selector: string; value: Record<string, unknown>; path: string[] }> =
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
        path: newPath,
      })
    }
  }

  return results
}
