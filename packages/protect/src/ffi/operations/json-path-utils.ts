import type { JsonPath } from '../../types'

/**
 * Converts a JsonPath (array or dot-separated string) to standard JSONPath format: $.path.to.key
 */
export function toJsonPath(path: JsonPath): string {
  const pathArray = Array.isArray(path) ? path : path.split('.')
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
