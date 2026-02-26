import { defineContract, encrypted } from '@/contract'
import { expect, vi } from 'vitest'

// ============ Contract Fixtures ============

/**
 * Contract with multiple tables for testing
 */
export const contract = defineContract({
  users: {
    email: encrypted({ type: 'string', equality: true }),
    bio: encrypted({ type: 'string', freeTextSearch: true }),
    age: encrypted({ type: 'number', orderAndRange: true }),
  },
  articles: {
    content: encrypted({ type: 'string', freeTextSearch: true }),
  },
  products: {
    price: encrypted({ type: 'number', orderAndRange: true }),
  },
  metadata: {
    raw: encrypted({ type: 'string' }),
  },
  documents: {
    id: encrypted({ type: 'string' }),
    metadata: encrypted({ type: 'json', searchableJson: true }),
  },
  records: {
    id: encrypted({ type: 'string' }),
    email: encrypted({ type: 'string', equality: true }),
    name: encrypted({ type: 'string', freeTextSearch: true }),
    metadata: encrypted({ type: 'json', searchableJson: true }),
  },
})

// ============ Mock Factories ============

/**
 * Creates a mock LockContext with successful response
 */
export function createMockLockContext(overrides?: {
  accessToken?: string
  expiry?: number
  identityClaim?: string[]
}) {
  return {
    getLockContext: vi.fn().mockResolvedValue({
      data: {
        ctsToken: {
          accessToken: overrides?.accessToken ?? 'mock-token',
          expiry: overrides?.expiry ?? Date.now() + 3600000,
        },
        context: {
          identityClaim: overrides?.identityClaim ?? ['sub'],
        },
      },
    }),
  }
}

/**
 * Creates a mock LockContext with explicit null context (simulates runtime edge case)
 */
export function createMockLockContextWithNullContext() {
  return {
    getLockContext: vi.fn().mockResolvedValue({
      data: {
        ctsToken: {
          accessToken: 'mock-token',
          expiry: Date.now() + 3600000,
        },
        context: null, // Explicit null - simulating runtime edge case
      },
    }),
  }
}

/**
 * Creates a mock LockContext that returns a failure
 */
export function createFailingMockLockContext(
  errorType: string,
  message: string,
) {
  return {
    getLockContext: vi.fn().mockResolvedValue({
      failure: { type: errorType, message },
    }),
  }
}

// ============ Test Helpers ============

/**
 * Unwraps a Result type, throwing an error if it's a failure.
 * Use this to simplify test assertions when you expect success.
 */
export function unwrapResult<T>(result: {
  data?: T
  failure?: { message: string }
}): T {
  if (result.failure) {
    throw new Error(result.failure.message)
  }
  return result.data as T
}

/**
 * Asserts that a result is a failure with optional message and type matching
 */
export function expectFailure(
  result: { failure?: { message: string; type?: string } },
  messagePattern?: string | RegExp,
  expectedType?: string,
) {
  expect(result.failure).toBeDefined()
  if (messagePattern) {
    if (typeof messagePattern === 'string') {
      expect(result.failure?.message).toContain(messagePattern)
    } else {
      expect(result.failure?.message).toMatch(messagePattern)
    }
  }
  if (expectedType) {
    expect(result.failure?.type).toBe(expectedType)
  }
}
