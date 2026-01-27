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
export const expectJsonPathWithValue = (term: Record<string, unknown>) => {
  // Path queries with value now return { sv: [...] } format (same as containment)
  expectSteVecArray(term as { sv?: Array<Record<string, unknown>> })
}

/** Validates path-only query has only selector, no additional content */
export const expectJsonPathSelectorOnly = (term: Record<string, unknown>) => {
  expectSteVecSelector(term as { s?: string })
  // No encrypted content for path-only queries
  expect(term).not.toHaveProperty('c')
}

/** Validates basic encrypted payload structure with index info and version */
export const expectBasicEncryptedPayload = (term: Record<string, unknown>) => {
  expect(term).toHaveProperty('i')
  expect(term).toHaveProperty('v')
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
