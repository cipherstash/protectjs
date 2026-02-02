/**
 * JSONB Query Validation Helpers
 *
 * Shared helper functions for validating encrypted query term structures.
 * Eliminates duplicated validation logic across test files.
 */
import { expect } from 'vitest'

/**
 * Verify the search term has selector-only format (path without value).
 * Selector-only terms have { s: string } structure.
 *
 * @param term - The encrypted query term to validate
 */
export function expectJsonPathSelectorOnly(term: unknown): void {
  const record = term as Record<string, unknown>
  expect(record).toHaveProperty('s')
  expect(typeof record.s).toBe('string')
}

/**
 * Verify the search term has path with value format.
 * Path+value queries return { sv: [...] } with the ste_vec entries.
 *
 * @param term - The encrypted query term to validate
 */
export function expectJsonPathWithValue(term: unknown): void {
  const record = term as Record<string, unknown>
  expect(record).toHaveProperty('sv')
  expect(Array.isArray(record.sv)).toBe(true)
  const sv = record.sv as Array<unknown>
  expect(sv.length).toBeGreaterThan(0)
}

/**
 * Verify the search term has HMAC format for equality queries.
 * Equality queries return { hm: string } with the HMAC value.
 *
 * @param term - The encrypted query term to validate
 */
export function expectHmacTerm(term: unknown): void {
  const record = term as Record<string, unknown>
  expect(record).toHaveProperty('hm')
  expect(typeof record.hm).toBe('string')
}

/**
 * Verify the search term has ORE format for range/ordering queries.
 * Range queries return { ob: [...] } with the order-preserving bytes.
 *
 * @param term - The encrypted query term to validate
 */
export function expectOreTerm(term: unknown): void {
  const record = term as Record<string, unknown>
  expect(record).toHaveProperty('ob')
  expect(Array.isArray(record.ob)).toBe(true)
  const ob = record.ob as Array<unknown>
  expect(ob.length).toBeGreaterThan(0)
}

/**
 * Verify the search term is an equality term (alias for expectHmacTerm).
 *
 * @param term - The encrypted query term to validate
 */
export const expectEqualityTerm = expectHmacTerm

/**
 * Verify the search term is a range term (alias for expectOreTerm).
 *
 * @param term - The encrypted query term to validate
 */
export const expectRangeTerm = expectOreTerm

/**
 * Verify the search term has containment format.
 * Containment queries return { sv: [...] } similar to path+value.
 *
 * @param term - The encrypted query term to validate
 */
export function expectContainmentTerm(term: unknown): void {
  const record = term as Record<string, unknown>
  expect(record).toHaveProperty('sv')
  expect(Array.isArray(record.sv)).toBe(true)
}

/**
 * Verify encrypted data has the expected ciphertext structure.
 *
 * @param rawValue - The raw stringified encrypted value from the database
 */
export function expectEncryptedStructure(rawValue: string): void {
  // Should have encrypted structure (c = ciphertext indicator)
  expect(rawValue).toContain('"c"')
}

/**
 * Verify encrypted data does NOT contain plaintext values.
 *
 * @param rawValue - The raw stringified encrypted value from the database
 * @param plaintextValues - Array of plaintext strings that should NOT appear
 */
export function expectNoPlaintext(rawValue: string, plaintextValues: string[]): void {
  for (const plaintext of plaintextValues) {
    expect(rawValue).not.toContain(plaintext)
  }
}

/**
 * Verify encrypted object has the ciphertext property.
 *
 * @param encryptedValue - The encrypted value object from the database
 */
export function expectCiphertextProperty(encryptedValue: unknown): void {
  const record = encryptedValue as Record<string, unknown>
  expect(record).toBeDefined()
  expect(record).toHaveProperty('c')
}
