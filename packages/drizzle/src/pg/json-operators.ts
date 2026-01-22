/**
 * Normalizes a JSON path to dot notation format.
 * Accepts both JSONPath format ($.user.email) and dot notation (user.email).
 *
 * @param path - The path in JSONPath or dot notation format
 * @returns The normalized path in dot notation format
 */
export function normalizePath(path: string): string {
  if (path === '$') {
    return ''
  }
  if (path.startsWith('$.')) {
    return path.slice(2)
  }
  return path
}
