import 'dotenv/config'
import { describe, expect, it, beforeAll } from 'vitest'
import { protect } from '../src'

type ProtectClient = Awaited<ReturnType<typeof protect>>
import {
  jsonbSchema,
  metadata,
  unwrapResult,
  expectFailure,
} from './fixtures'

/*
 * The `searchableJson` queryType provides a friendlier API by auto-inferring the
 * underlying query operation from the plaintext type. It's equivalent to omitting
 * queryType on ste_vec columns, but explicit for code clarity.
 * - String values → ste_vec_selector (JSONPath queries)
 * - Object/Array values → ste_vec_term (containment queries)
 */

describe('encryptQuery with searchableJson queryType', () => {
  let protectClient: ProtectClient

  beforeAll(async () => {
    protectClient = await protect({ schemas: [jsonbSchema, metadata] })
  })

  // Core functionality: auto-inference from plaintext type

  it('auto-infers ste_vec_selector for string plaintext (JSONPath)', async () => {
    const result = await protectClient.encryptQuery('$.user.email', {
      column: jsonbSchema.metadata,
      table: jsonbSchema,
      queryType: 'searchableJson',
    })

    const data = unwrapResult(result)
    expect(data).toBeDefined()
    expect(data).toMatchObject({
      i: { t: 'documents', c: 'metadata' },
    })
  }, 30000)

  it('auto-infers ste_vec_term for object plaintext (containment)', async () => {
    const result = await protectClient.encryptQuery({ role: 'admin' }, {
      column: jsonbSchema.metadata,
      table: jsonbSchema,
      queryType: 'searchableJson',
    })

    const data = unwrapResult(result)
    expect(data).toBeDefined()
    expect(data).toMatchObject({
      i: { t: 'documents', c: 'metadata' },
    })
  }, 30000)

  it('auto-infers ste_vec_term for nested object', async () => {
    const result = await protectClient.encryptQuery(
      { user: { profile: { role: 'admin' } } },
      {
        column: jsonbSchema.metadata,
        table: jsonbSchema,
        queryType: 'searchableJson',
      }
    )

    const data = unwrapResult(result)
    expect(data).toBeDefined()
    expect(data).toMatchObject({
      i: { t: 'documents', c: 'metadata' },
    })
  }, 30000)

  it('auto-infers ste_vec_term for array plaintext', async () => {
    const result = await protectClient.encryptQuery(['admin', 'user'], {
      column: jsonbSchema.metadata,
      table: jsonbSchema,
      queryType: 'searchableJson',
    })

    const data = unwrapResult(result)
    expect(data).toBeDefined()
    expect(data).toMatchObject({
      i: { t: 'documents', c: 'metadata' },
    })
  }, 30000)

  it('returns null for null plaintext', async () => {
    const result = await protectClient.encryptQuery(null, {
      column: jsonbSchema.metadata,
      table: jsonbSchema,
      queryType: 'searchableJson',
    })

    const data = unwrapResult(result)
    expect(data).toBeNull()
  }, 30000)

  // Edge cases: number/boolean require wrapping (same as steVecTerm)

  it('fails for bare number plaintext (requires wrapping)', async () => {
    const result = await protectClient.encryptQuery(42, {
      column: jsonbSchema.metadata,
      table: jsonbSchema,
      queryType: 'searchableJson',
    })

    expectFailure(result, /Wrap the number in a JSON object/)
  }, 30000)

  it('fails for bare boolean plaintext (requires wrapping)', async () => {
    const result = await protectClient.encryptQuery(true, {
      column: jsonbSchema.metadata,
      table: jsonbSchema,
      queryType: 'searchableJson',
    })

    expectFailure(result, /Wrap the boolean in a JSON object/)
  }, 30000)
})

describe('encryptQuery with searchableJson column and omitted queryType', () => {
  let protectClient: ProtectClient

  beforeAll(async () => {
    protectClient = await protect({ schemas: [jsonbSchema, metadata] })
  })

  it('auto-infers ste_vec_selector for string plaintext (JSONPath)', async () => {
    const result = await protectClient.encryptQuery('$.user.email', {
      column: jsonbSchema.metadata,
      table: jsonbSchema,
    })

    const data = unwrapResult(result)
    expect(data).toBeDefined()
    expect(data).toMatchObject({
      i: { t: 'documents', c: 'metadata' },
    })
  }, 30000)

  it('auto-infers ste_vec_term for object plaintext (containment)', async () => {
    const result = await protectClient.encryptQuery({ role: 'admin' }, {
      column: jsonbSchema.metadata,
      table: jsonbSchema,
    })

    const data = unwrapResult(result)
    expect(data).toBeDefined()
    expect(data).toMatchObject({
      i: { t: 'documents', c: 'metadata' },
    })
  }, 30000)

  it('returns null for null plaintext', async () => {
    const result = await protectClient.encryptQuery(null, {
      column: jsonbSchema.metadata,
      table: jsonbSchema,
    })

    const data = unwrapResult(result)
    expect(data).toBeNull()
  }, 30000)

  it('fails for bare number plaintext (requires wrapping)', async () => {
    const result = await protectClient.encryptQuery(42, {
      column: jsonbSchema.metadata,
      table: jsonbSchema,
    })

    expectFailure(result, /Wrap the number in a JSON object/)
  }, 30000)

  it('fails for bare boolean plaintext (requires wrapping)', async () => {
    const result = await protectClient.encryptQuery(true, {
      column: jsonbSchema.metadata,
      table: jsonbSchema,
    })

    expectFailure(result, /Wrap the boolean in a JSON object/)
  }, 30000)
})

describe('searchableJson validation', () => {
  let protectClient: ProtectClient

  beforeAll(async () => {
    protectClient = await protect({ schemas: [jsonbSchema, metadata] })
  })

  it('throws when used on column without ste_vec index', async () => {
    const result = await protectClient.encryptQuery('$.path', {
      column: metadata.raw, // raw column has no ste_vec index
      table: metadata,
      queryType: 'searchableJson',
    })

    expectFailure(result)
  }, 30000)
})

describe('searchableJson batch operations', () => {
  let protectClient: ProtectClient

  beforeAll(async () => {
    protectClient = await protect({ schemas: [jsonbSchema] })
  })

  it('handles mixed plaintext types in single batch', async () => {
    const result = await protectClient.encryptQuery([
      {
        value: '$.user.email',  // string → ste_vec_selector
        column: jsonbSchema.metadata,
        table: jsonbSchema,
        queryType: 'searchableJson',
      },
      {
        value: { role: 'admin' },  // object → ste_vec_term
        column: jsonbSchema.metadata,
        table: jsonbSchema,
        queryType: 'searchableJson',
      },
      {
        value: ['tag1', 'tag2'],  // array → ste_vec_term
        column: jsonbSchema.metadata,
        table: jsonbSchema,
        queryType: 'searchableJson',
      },
    ])

    const data = unwrapResult(result)
    expect(data).toHaveLength(3)
    expect(data[0]).toMatchObject({ i: { t: 'documents', c: 'metadata' } })
    expect(data[1]).toMatchObject({ i: { t: 'documents', c: 'metadata' } })
    expect(data[2]).toMatchObject({ i: { t: 'documents', c: 'metadata' } })
  }, 30000)

  it('handles null values in batch', async () => {
    const result = await protectClient.encryptQuery([
      {
        value: null,
        column: jsonbSchema.metadata,
        table: jsonbSchema,
        queryType: 'searchableJson',
      },
      {
        value: '$.user.email',
        column: jsonbSchema.metadata,
        table: jsonbSchema,
        queryType: 'searchableJson',
      },
      {
        value: null,
        column: jsonbSchema.metadata,
        table: jsonbSchema,
        queryType: 'searchableJson',
      },
    ])

    const data = unwrapResult(result)
    expect(data).toHaveLength(3)
    expect(data[0]).toBeNull()
    expect(data[1]).not.toBeNull()
    expect(data[2]).toBeNull()
  }, 30000)

  it('can be mixed with explicit steVecSelector/steVecTerm in batch', async () => {
    const result = await protectClient.encryptQuery([
      {
        value: '$.path1',
        column: jsonbSchema.metadata,
        table: jsonbSchema,
        queryType: 'searchableJson',  // auto-infer
      },
      {
        value: '$.path2',
        column: jsonbSchema.metadata,
        table: jsonbSchema,
        queryType: 'steVecSelector',  // explicit
      },
      {
        value: { key: 'value' },
        column: jsonbSchema.metadata,
        table: jsonbSchema,
        queryType: 'steVecTerm',  // explicit
      },
    ])

    const data = unwrapResult(result)
    expect(data).toHaveLength(3)
    expect(data[0]).toBeDefined()
    expect(data[1]).toBeDefined()
    expect(data[2]).toBeDefined()
  }, 30000)

  it('can omit queryType for searchableJson in batch', async () => {
    const result = await protectClient.encryptQuery([
      {
        value: '$.path1',
        column: jsonbSchema.metadata,
        table: jsonbSchema,
      },
      {
        value: { key: 'value' },
        column: jsonbSchema.metadata,
        table: jsonbSchema,
      },
      {
        value: null,
        column: jsonbSchema.metadata,
        table: jsonbSchema,
      },
    ])

    const data = unwrapResult(result)
    expect(data).toHaveLength(3)
    expect(data[0]).toBeDefined()
    expect(data[1]).toBeDefined()
    expect(data[2]).toBeNull()
  }, 30000)
})

describe('searchableJson with returnType formatting', () => {
  let protectClient: ProtectClient

  beforeAll(async () => {
    protectClient = await protect({ schemas: [jsonbSchema] })
  })

  it('supports composite-literal returnType', async () => {
    const result = await protectClient.encryptQuery([
      {
        value: '$.user.email',
        column: jsonbSchema.metadata,
        table: jsonbSchema,
        queryType: 'searchableJson',
        returnType: 'composite-literal',
      },
    ])

    const data = unwrapResult(result)
    expect(data).toHaveLength(1)
    expect(typeof data[0]).toBe('string')
    // Format: ("json")
    expect(data[0]).toMatch(/^\(".*"\)$/)
  }, 30000)

  it('supports escaped-composite-literal returnType', async () => {
    const result = await protectClient.encryptQuery([
      {
        value: { role: 'admin' },
        column: jsonbSchema.metadata,
        table: jsonbSchema,
        queryType: 'searchableJson',
        returnType: 'escaped-composite-literal',
      },
    ])

    const data = unwrapResult(result)
    expect(data).toHaveLength(1)
    expect(typeof data[0]).toBe('string')
    // Format: "(\"json\")" - outer quotes with escaped inner quotes
    expect(data[0]).toMatch(/^"\(.*\)"$/)
  }, 30000)
})

describe('searchableJson with LockContext', () => {
  let protectClient: ProtectClient

  beforeAll(async () => {
    protectClient = await protect({ schemas: [jsonbSchema] })
  })

  it('exposes withLockContext method', async () => {
    const operation = protectClient.encryptQuery('$.user.email', {
      column: jsonbSchema.metadata,
      table: jsonbSchema,
      queryType: 'searchableJson',
    })

    expect(operation.withLockContext).toBeDefined()
    expect(typeof operation.withLockContext).toBe('function')
  })

  // Note: Full LockContext integration tested in lock-context.test.ts
  // These tests verify the API surface is correct for searchableJson
})
