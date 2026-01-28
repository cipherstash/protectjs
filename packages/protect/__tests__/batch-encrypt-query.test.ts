import 'dotenv/config'
import { csColumn, csTable } from '@cipherstash/schema'
import { beforeAll, describe, expect, it } from 'vitest'
import { LockContext, type QueryTerm, protect, type ProtectErrorCode } from '../src'
import {
  expectHasHm,
  expectSteVecArray,
  expectJsonPathWithValue,
  expectJsonPathSelectorOnly,
  expectCompositeLiteralWithEncryption,
} from './test-utils/query-terms'

const users = csTable('users', {
  email: csColumn('email').freeTextSearch().equality().orderAndRange(),
  score: csColumn('score').dataType('number').orderAndRange(),
})

const jsonSchema = csTable('json_users', {
  metadata: csColumn('metadata').searchableJson(),
})

let protectClient: Awaited<ReturnType<typeof protect>>

beforeAll(async () => {
  protectClient = await protect({ schemas: [users, jsonSchema] })
})

describe('encryptQuery batch overload', () => {
  it('should return empty array for empty input', async () => {
    const result = await protectClient.encryptQuery([])

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toEqual([])
  })

  it('should encrypt batch of scalar terms', async () => {
    const terms: QueryTerm[] = [
      {
        value: 'test@example.com',
        column: users.email,
        table: users,
        queryType: 'equality',
      },
      { value: 100, column: users.score, table: users, queryType: 'orderAndRange' },
    ]

    const result = await protectClient.encryptQuery(terms)

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(2)
    expect(result.data[0]).toHaveProperty('hm') // unique returns HMAC
  })
})

describe('encryptQuery batch - JSON path queries', () => {
  it('should encrypt JSON path query with value', async () => {
    const terms: QueryTerm[] = [
      {
        path: 'user.email',
        value: 'test@example.com',
        column: jsonSchema.metadata,
        table: jsonSchema,
      },
    ]

    const result = await protectClient.encryptQuery(terms)

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathWithValue(result.data[0] as Record<string, unknown>)
  })

  it('should encrypt JSON path query without value (selector only)', async () => {
    const terms: QueryTerm[] = [
      { path: 'user.role', column: jsonSchema.metadata, table: jsonSchema },
    ]

    const result = await protectClient.encryptQuery(terms)

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectJsonPathSelectorOnly(result.data[0] as Record<string, unknown>)
  })
})

describe('encryptQuery batch - JSON containment queries', () => {
  it('should encrypt JSON contains query', async () => {
    const terms: QueryTerm[] = [
      {
        contains: { role: 'admin' },
        column: jsonSchema.metadata,
        table: jsonSchema,
      },
    ]

    const result = await protectClient.encryptQuery(terms)

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    // sv array length depends on FFI flattening implementation
    expectSteVecArray(result.data[0] as { sv: Array<Record<string, unknown>> })
  })

  it('should encrypt JSON containedBy query', async () => {
    const terms: QueryTerm[] = [
      {
        containedBy: { status: 'active' },
        column: jsonSchema.metadata,
        table: jsonSchema,
      },
    ]

    const result = await protectClient.encryptQuery(terms)

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expectSteVecArray(result.data[0] as { sv: Array<Record<string, unknown>> })
  })
})

describe('encryptQuery batch - mixed term types', () => {
  it('should encrypt mixed batch of scalar and JSON terms', async () => {
    const terms: QueryTerm[] = [
      {
        value: 'test@example.com',
        column: users.email,
        table: users,
        queryType: 'equality',
      },
      {
        path: 'user.email',
        value: 'json@example.com',
        column: jsonSchema.metadata,
        table: jsonSchema,
      },
      {
        contains: { role: 'admin' },
        column: jsonSchema.metadata,
        table: jsonSchema,
      },
    ]

    const result = await protectClient.encryptQuery(terms)

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(3)
    // First term: scalar unique - should have HMAC
    expectHasHm(result.data[0] as { hm?: string })

    // Second term: JSON path with value - should have selector and encrypted content
    expectJsonPathWithValue(result.data[1] as Record<string, unknown>)

    // Third term: JSON containment with sv array
    expectSteVecArray(result.data[2] as { sv: Array<Record<string, unknown>> })
  })
})

describe('encryptQuery batch - return type formatting', () => {
  it('should format as composite-literal', async () => {
    const terms: QueryTerm[] = [
      {
        value: 'test@example.com',
        column: users.email,
        table: users,
        queryType: 'equality',
        returnType: 'composite-literal',
      },
    ]

    const result = await protectClient.encryptQuery(terms)

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expectCompositeLiteralWithEncryption(
      result.data[0] as string,
      (parsed) => expectHasHm(parsed as { hm?: string })
    )
  })
})

describe('encryptQuery batch - readonly/as const support', () => {
  it('should accept readonly array (as const)', async () => {
    const terms = [
      {
        value: 'test@example.com',
        column: users.email,
        table: users,
        queryType: 'equality' as const,
      },
    ] as const

    const result = await protectClient.encryptQuery(terms)

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
  })
})

describe('encryptQuery batch - auto-infer index type', () => {
  it('should auto-infer index type when not specified', async () => {
    const result = await protectClient.encryptQuery([
      { value: 'test@example.com', column: users.email, table: users },
      // No indexType - should auto-infer from column config
    ])

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    // Auto-inferred result should be a valid encrypted payload
    expect(result.data[0]).not.toBeNull()
    expect(typeof result.data[0]).toBe('object')
    expect(result.data[0]).toHaveProperty('c')
  })

  it('should use explicit index type when specified', async () => {
    const result = await protectClient.encryptQuery([
      {
        value: 'test@example.com',
        column: users.email,
        table: users,
        queryType: 'equality',
      },
    ])

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    expect(result.data[0]).toHaveProperty('hm') // unique returns HMAC
  })

  it('should handle mixed batch with and without indexType', async () => {
    const result = await protectClient.encryptQuery([
      // Explicit indexType
      {
        value: 'explicit@example.com',
        column: users.email,
        table: users,
        queryType: 'equality',
      },
      // Auto-infer indexType
      { value: 'auto@example.com', column: users.email, table: users },
      // Another explicit indexType
      { value: 100, column: users.score, table: users, queryType: 'orderAndRange' },
    ])

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(3)
    // First term: explicit unique should have hm
    expect(result.data[0]).toHaveProperty('hm')
    // Second term: auto-inferred should be valid encrypted payload
    expect(result.data[1]).not.toBeNull()
    expect(typeof result.data[1]).toBe('object')
    expect(result.data[1]).toHaveProperty('c')
    // Third term: explicit ore should have valid encryption
    expect(result.data[2]).not.toBeNull()
  })
})



describe('encryptQuery - ste_vec type inference', () => {
  it('should infer selector mode for JSON path string plaintext with queryOp default', async () => {
    // JSON path string + queryOp: 'default' for ste_vec → produces selector-only output (has `s` field)
    // String must be a valid JSON path starting with '$'
    const result = await protectClient.encryptQuery([
      {
        value: '$.user.email',
        column: jsonSchema.metadata,
        table: jsonSchema,
        queryType: 'searchableJson',
        queryOp: 'default',
      },
    ])

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    const encrypted = result.data[0] as Record<string, unknown>
    // JSON path string with default queryOp produces selector-only output
    expect(encrypted).toHaveProperty('s')
    expect(typeof encrypted.s).toBe('string')
    // Selector-only should NOT have sv array
    expect(encrypted).not.toHaveProperty('sv')
  })

  it('should infer containment mode for object plaintext with queryOp default', async () => {
    // Object plaintext + queryOp: 'default' for ste_vec → produces containment output (has `sv` array)
    const result = await protectClient.encryptQuery([
      {
        value: { role: 'admin', status: 'active' },
        column: jsonSchema.metadata,
        table: jsonSchema,
        queryType: 'searchableJson',
        queryOp: 'default',
      },
    ])

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    const encrypted = result.data[0] as Record<string, unknown>
    // Object plaintext with default queryOp produces containment output
    expect(encrypted).toHaveProperty('sv')
    expect(Array.isArray(encrypted.sv)).toBe(true)
    const svArray = encrypted.sv as Array<Record<string, unknown>>
    expect(svArray.length).toBeGreaterThan(0)
    // Each sv entry should have a selector
    expect(svArray[0]).toHaveProperty('s')
  })

  it('should infer containment mode for array plaintext with queryOp default', async () => {
    // Array plaintext + queryOp: 'default' for ste_vec → produces containment output (has `sv` array)
    const result = await protectClient.encryptQuery([
      {
        value: ['tag1', 'tag2', 'tag3'],
        column: jsonSchema.metadata,
        table: jsonSchema,
        queryType: 'searchableJson',
        queryOp: 'default',
      },
    ])

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    const encrypted = result.data[0] as Record<string, unknown>
    // Array plaintext with default queryOp produces containment output
    expect(encrypted).toHaveProperty('sv')
    expect(Array.isArray(encrypted.sv)).toBe(true)
    const svArray = encrypted.sv as Array<Record<string, unknown>>
    expect(svArray.length).toBeGreaterThan(0)
  })

  it('should respect explicit ste_vec_selector queryOp', async () => {
    const result = await protectClient.encryptQuery([
      {
        value: '$.user.email',
        column: jsonSchema.metadata,
        table: jsonSchema,
        queryType: 'searchableJson',
        queryOp: 'ste_vec_selector',
      },
    ])

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    const encrypted = result.data[0] as Record<string, unknown>
    // Explicit ste_vec_selector produces selector-only output
    expect(encrypted).toHaveProperty('s')
    expect(typeof encrypted.s).toBe('string')
  })

  it('should respect explicit ste_vec_term queryOp', async () => {
    const result = await protectClient.encryptQuery([
      {
        value: { key: 'value' },
        column: jsonSchema.metadata,
        table: jsonSchema,
        queryType: 'searchableJson',
        queryOp: 'ste_vec_term',
      },
    ])

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toHaveLength(1)
    const encrypted = result.data[0] as Record<string, unknown>
    // Explicit ste_vec_term produces containment output
    expect(encrypted).toHaveProperty('sv')
    expect(Array.isArray(encrypted.sv)).toBe(true)
  })
})

describe('encryptQuery single-value - auto-infer index type', () => {
  it('should auto-infer index type for single value when not specified', async () => {
    const result = await protectClient.encryptQuery('test@example.com', {
      column: users.email,
      table: users,
      // No indexType - should auto-infer from column config
    })

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    // Auto-inferred result should be a valid encrypted payload
    expect(result.data).not.toBeNull()
    expect(typeof result.data).toBe('object')
    expect(result.data).toHaveProperty('c')
  })

  it('should use explicit index type for single value when specified', async () => {
    const result = await protectClient.encryptQuery('test@example.com', {
      column: users.email,
      table: users,
      queryType: 'equality',
    })

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toHaveProperty('hm') // unique returns HMAC
  })

  it('should handle null value with auto-infer', async () => {
    const result = await protectClient.encryptQuery(null, {
      column: users.email,
      table: users,
      // No indexType
    })

    if (result.failure) {
      throw new Error(`[protect]: ${result.failure.message}`)
    }

    expect(result.data).toBeNull()
  })
})

// Schema without ste_vec index for error testing
const schemaWithoutSteVec = csTable('test_no_ste_vec', {
  data: csColumn('data').dataType('json'),
})

describe('encryptQuery - error code propagation', () => {
  let clientWithNoSteVec: Awaited<ReturnType<typeof protect>>

  beforeAll(async () => {
    clientWithNoSteVec = await protect({ schemas: [users, schemaWithoutSteVec] })
  })

  it('should propagate UNKNOWN_COLUMN error code for non-existent column', async () => {
    // Create a fake column reference that doesn't exist in the schema
    const result = await protectClient.encryptQuery([
      {
        value: 'test',
        column: { getName: () => 'nonexistent_column' } as any,
        table: users,
        queryType: 'equality',
      },
    ])

    expect(result.failure).toBeDefined()
    expect(result.failure?.code).toBe('UNKNOWN_COLUMN' as ProtectErrorCode)
  })

  it('should propagate MISSING_INDEX error code for column without required index', async () => {
    // Query with ste_vec on a column that only has json dataType (no searchableJson)
    const result = await clientWithNoSteVec.encryptQuery([
      {
        value: { key: 'value' },
        column: schemaWithoutSteVec.data,
        table: schemaWithoutSteVec,
        queryType: 'searchableJson',
      },
    ])

    expect(result.failure).toBeDefined()
    expect(result.failure?.code).toBe('MISSING_INDEX' as ProtectErrorCode)
  })

  it('should include error code in failure object when FFI throws', async () => {
    const result = await protectClient.encryptQuery([
      {
        value: 'test',
        column: { getName: () => 'bad_column' } as any,
        table: { tableName: 'bad_table' } as any,
        queryType: 'equality',
      },
    ])

    expect(result.failure).toBeDefined()
    // Error should have a code property (could be UNKNOWN_COLUMN or other FFI error)
    expect(result.failure?.message).toBeDefined()
    // The code property should exist on errors from FFI
    if (result.failure?.code) {
      expect(typeof result.failure.code).toBe('string')
    }
  })

  it('should preserve error message alongside error code', async () => {
    const result = await protectClient.encryptQuery([
      {
        value: 'test',
        column: { getName: () => 'missing_column' } as any,
        table: users,
        queryType: 'equality',
      },
    ])

    expect(result.failure).toBeDefined()
    expect(result.failure?.message).toBeTruthy()
    expect(result.failure?.type).toBe('EncryptionError')
    // Both message and code should be present
    if (result.failure?.code) {
      expect(['UNKNOWN_COLUMN', 'UNKNOWN']).toContain(result.failure.code)
    }
  })
})
