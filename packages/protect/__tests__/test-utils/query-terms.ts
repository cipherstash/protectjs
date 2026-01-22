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
