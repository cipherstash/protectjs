import type { Encrypted as FfiEncrypted } from '@cipherstash/protect-ffi'

/**
 * Encode/decode helpers for the Postgres `eql_v2_encrypted` composite type.
 *
 * The composite has a single text field that holds the EQL JSON envelope.
 * Postgres represents this on the wire (via node-postgres) as a literal
 * string of the form `("<escaped-json>")` — i.e. the outer parens delimit
 * the composite, the inner double-quotes wrap the field, and embedded
 * double-quotes are doubled (`""`). These helpers are the inverse of the
 * composite-literal helpers in `packages/stack/src/encryption/helpers/`,
 * but specialized to the codec's wire shape (string in/string out) and
 * tolerant of the small variations the driver actually returns.
 */

export type EqlEncrypted = FfiEncrypted

/**
 * Convert an `Encrypted` JSON envelope into the Postgres composite-literal
 * form expected by the `eql_v2_encrypted` type.
 */
export function eqlToCompositeLiteral(encrypted: EqlEncrypted): string {
  const json = JSON.stringify(encrypted)
  // Inside a composite literal, double-quotes inside a field value are
  // doubled. The outer pair of quotes wraps the whole field; outer parens
  // wrap the composite tuple.
  const escaped = json.replace(/"/g, '""')
  return `("${escaped}")`
}

/**
 * Parse the wire string returned for an `eql_v2_encrypted` composite back
 * into an `Encrypted` JSON envelope. Mirrors the parser in the Drizzle
 * integration so behavioral parity is preserved for users moving between
 * ORMs.
 */
export function eqlFromCompositeLiteral(wire: string): EqlEncrypted {
  if (typeof wire !== 'string') {
    throw new TypeError(
      `eql_v2_encrypted wire value must be a string, got ${typeof wire}`,
    )
  }
  const trimmed = wire.trim()
  if (trimmed.startsWith('(') && trimmed.endsWith(')')) {
    let inner = trimmed.slice(1, -1)
    inner = inner.replace(/""/g, '"')
    if (inner.startsWith('"') && inner.endsWith('"')) {
      inner = inner.slice(1, -1)
    }
    return JSON.parse(inner) as EqlEncrypted
  }
  // Some drivers or row materializers may already hand back the raw JSON
  // (e.g. when the column is selected through a JSON-projecting helper).
  return JSON.parse(trimmed) as EqlEncrypted
}
