import { expect } from 'vitest'

export const parseCompositeLiteral = (term: string) => {
  const inner = JSON.parse(term.slice(1, -1)) as string
  return JSON.parse(inner)
}

export const expectMatchIndex = (term: { bf?: unknown[] }) => {
  expect(term).toHaveProperty('bf')
  expect(Array.isArray(term.bf)).toBe(true)
  expect(term.bf?.length).toBeGreaterThan(0)
}

export const expectOreIndex = (term: { ob?: unknown[] }) => {
  expect(term).toHaveProperty('ob')
  expect(Array.isArray(term.ob)).toBe(true)
  expect(term.ob?.length).toBeGreaterThan(0)
}

export const expectHasHm = (term: { hm?: string }) => {
  expect(term).toHaveProperty('hm')
}

/** Validates encrypted selector field */
export const expectSteVecSelector = (term: { s?: string }) => {
  expect(term).toHaveProperty('s')
  expect(typeof term.s).toBe('string')
  expect(term.s).toMatch(/^[0-9a-f]+$/)
}

/** Validates an sv array entry has selector and additional content */
export const expectSteVecEntry = (entry: Record<string, unknown>) => {
  expectSteVecSelector(entry as { s?: string })
  // Entry should have more than just the selector
  expect(Object.keys(entry).length).toBeGreaterThan(1)
}

/** Validates sv array structure with proper entries */
export const expectSteVecArray = (
  term: { sv?: Array<Record<string, unknown>> },
  expectedLength?: number
) => {
  expect(term).toHaveProperty('sv')
  expect(Array.isArray(term.sv)).toBe(true)
  if (expectedLength !== undefined) {
    expect(term.sv).toHaveLength(expectedLength)
  } else {
    expect(term.sv!.length).toBeGreaterThan(0)
  }
  for (const entry of term.sv!) {
    expectSteVecEntry(entry)
  }
}

/** Validates path query with value returns sv array structure (same as containment) */
export const expectJsonPathWithValue = (
  term: Record<string, unknown>,
  originalPath?: string,
  originalValue?: unknown
) => {
  // Verify EQL v2 structure
  expectBasicEncryptedPayload(term)

  // Path queries with value now return { sv: [...] } format (same as containment)
  expectSteVecArray(term as { sv?: Array<Record<string, unknown>> })

  // Verify plaintext does not leak into encrypted term
  const termString = JSON.stringify(term)
  if (originalPath && originalPath.length > 3) {
    expect(termString).not.toContain(originalPath)
  }
  if (originalValue !== undefined && originalValue !== null) {
    const valueString =
      typeof originalValue === 'string'
        ? originalValue
        : JSON.stringify(originalValue)
    if (valueString.length > 3) {
      expect(termString).not.toContain(valueString)
    }
  }
}

/** Validates path-only query has only selector, no additional content */
export const expectJsonPathSelectorOnly = (
  term: Record<string, unknown>,
  originalPath?: string
) => {
  // Verify EQL v2 structure
  expectBasicEncryptedPayload(term)

  expectSteVecSelector(term as { s?: string })
  // No encrypted content for path-only queries
  expect(term).not.toHaveProperty('c')

  // Verify plaintext path does not leak into encrypted term
  if (originalPath && originalPath.length > 3) {
    const termString = JSON.stringify(term)
    expect(termString).not.toContain(originalPath)
  }
}

/** Validates basic encrypted payload structure with index info and version */
export const expectBasicEncryptedPayload = (term: Record<string, unknown>) => {
  expect(term).toHaveProperty('i')
  expect(term).toHaveProperty('v')
}

/**
 * Validates a standard EQL v2 encrypted JSON payload structure.
 * Checks for required fields (i, v) and content field (c).
 * Optionally verifies that plaintext data does not leak into the ciphertext content.
 */
export const expectEncryptedJsonPayload = (
  payload: Record<string, unknown>,
  originalPlaintext?: unknown
) => {
  // Required EQL v2 structure
  expectBasicEncryptedPayload(payload)

  // Content field for regular JSON encryption (not searchableJson)
  expect(payload).toHaveProperty('c')

  // Should NOT have legacy k field
  expect(payload).not.toHaveProperty('k')

  // Verify plaintext does not leak into the actual ciphertext content (c field)
  // We check only the 'c' field to avoid false positives from metadata fields like 'i'
  // which may contain table/column names that could overlap with plaintext paths
  if (originalPlaintext !== undefined && originalPlaintext !== null) {
    const ciphertextContent = payload.c as string | undefined
    if (ciphertextContent && typeof ciphertextContent === 'string') {
      const plaintextString =
        typeof originalPlaintext === 'string'
          ? originalPlaintext
          : JSON.stringify(originalPlaintext)

      // Check that significant portions of plaintext are not in the encrypted content
      if (plaintextString.length > 10) {
        expect(ciphertextContent).not.toContain(plaintextString)
      }
    }
  }
}

/** Validates composite literal is parseable and contains encrypted structure */
export const expectCompositeLiteralWithEncryption = (
  term: string,
  validateContent?: (parsed: Record<string, unknown>) => void
) => {
  expect(typeof term).toBe('string')
  expect(term).toMatch(/^\(.*\)$/)
  const parsed = parseCompositeLiteral(term)
  if (validateContent) {
    validateContent(parsed)
  }
}
