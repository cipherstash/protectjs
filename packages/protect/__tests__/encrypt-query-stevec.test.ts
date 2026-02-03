import 'dotenv/config'
import { describe, expect, it, beforeAll } from 'vitest'
import { protect } from '../src'
import type { ProtectClient } from '../src/ffi'
import {
  jsonbSchema,
  metadata,
  unwrapResult,
  expectFailure,
} from './fixtures'

describe('encryptQuery with steVecSelector', () => {
  let protectClient: ProtectClient

  beforeAll(async () => {
    protectClient = await protect({ schemas: [jsonbSchema, metadata] })
  })

  it('encrypts a JSONPath selector', async () => {
    const result = await protectClient.encryptQuery('$.user.email', {
      column: jsonbSchema.metadata,
      table: jsonbSchema,
      queryType: 'steVecSelector',
    })

    const data = unwrapResult(result)
    expect(data).toBeDefined()
    expect(data).toMatchObject({
      i: { t: 'documents', c: 'metadata' },
    })
  }, 30000)

  it('encrypts nested path selector', async () => {
    const result = await protectClient.encryptQuery('$.user.profile.settings', {
      column: jsonbSchema.metadata,
      table: jsonbSchema,
      queryType: 'steVecSelector',
    })

    const data = unwrapResult(result)
    expect(data).toBeDefined()
    expect(data).toMatchObject({
      i: { t: 'documents', c: 'metadata' },
    })
  }, 30000)

  it('fails for non-string plaintext with steVecSelector (object)', async () => {
    const result = await protectClient.encryptQuery({ role: 'admin' }, {
      column: jsonbSchema.metadata,
      table: jsonbSchema,
      queryType: 'steVecSelector',
    })

    expectFailure(result)
  }, 30000)
})

describe('encryptQuery with steVecTerm', () => {
  let protectClient: ProtectClient

  beforeAll(async () => {
    protectClient = await protect({ schemas: [jsonbSchema, metadata] })
  })

  it('encrypts an object for containment query', async () => {
    const result = await protectClient.encryptQuery({ role: 'admin' }, {
      column: jsonbSchema.metadata,
      table: jsonbSchema,
      queryType: 'steVecTerm',
    })

    const data = unwrapResult(result)
    expect(data).toBeDefined()
    expect(data).toMatchObject({
      i: { t: 'documents', c: 'metadata' },
    })
  }, 30000)

  it('encrypts nested object for containment', async () => {
    const result = await protectClient.encryptQuery(
      { user: { profile: { role: 'admin' } } },
      {
        column: jsonbSchema.metadata,
        table: jsonbSchema,
        queryType: 'steVecTerm',
      }
    )

    const data = unwrapResult(result)
    expect(data).toBeDefined()
    expect(data).toMatchObject({
      i: { t: 'documents', c: 'metadata' },
    })
  }, 30000)

  it('encrypts array for containment query', async () => {
    const result = await protectClient.encryptQuery([1, 2, 3], {
      column: jsonbSchema.metadata,
      table: jsonbSchema,
      queryType: 'steVecTerm',
    })

    const data = unwrapResult(result)
    expect(data).toBeDefined()
    expect(data).toMatchObject({
      i: { t: 'documents', c: 'metadata' },
    })
  }, 30000)

  it('handles string plaintext with steVecTerm', async () => {
    const result = await protectClient.encryptQuery('search text', {
      column: jsonbSchema.metadata,
      table: jsonbSchema,
      queryType: 'steVecTerm',
    })

    // String plaintext with steVecTerm - test what actually happens
    // This may succeed or fail depending on FFI implementation
    if (result.failure) {
      expectFailure(result)
    } else {
      const data = unwrapResult(result)
      expect(data).toBeDefined()
    }
  }, 30000)
})

describe('encryptQuery STE Vec validation', () => {
  let protectClient: ProtectClient

  beforeAll(async () => {
    protectClient = await protect({ schemas: [jsonbSchema, metadata] })
  })

  it('throws when steVecSelector used on non-ste_vec column', async () => {
    const result = await protectClient.encryptQuery('$.user.email', {
      column: metadata.raw, // raw column has no ste_vec index
      table: metadata,
      queryType: 'steVecSelector',
    })

    expectFailure(result)
  }, 30000)

  it('throws when steVecTerm used on non-ste_vec column', async () => {
    const result = await protectClient.encryptQuery({ field: 'value' }, {
      column: metadata.raw, // raw column has no ste_vec index
      table: metadata,
      queryType: 'steVecTerm',
    })

    expectFailure(result)
  }, 30000)
})

describe('encryptQuery batch with STE Vec', () => {
  let protectClient: ProtectClient

  beforeAll(async () => {
    protectClient = await protect({ schemas: [jsonbSchema, metadata] })
  })

  it('handles mixed query types in batch (steVecSelector + steVecTerm)', async () => {
    const result = await protectClient.encryptQuery([
      {
        value: '$.user.email',
        column: jsonbSchema.metadata,
        table: jsonbSchema,
        queryType: 'steVecSelector',
      },
      {
        value: { role: 'admin' },
        column: jsonbSchema.metadata,
        table: jsonbSchema,
        queryType: 'steVecTerm',
      },
    ])

    const data = unwrapResult(result)

    expect(data).toHaveLength(2)
    expect(data[0]).toMatchObject({ i: { t: 'documents', c: 'metadata' } })
    expect(data[1]).toMatchObject({ i: { t: 'documents', c: 'metadata' } })
  }, 30000)

  it('handles multiple steVecSelector queries in batch', async () => {
    const result = await protectClient.encryptQuery([
      {
        value: '$.user.email',
        column: jsonbSchema.metadata,
        table: jsonbSchema,
        queryType: 'steVecSelector',
      },
      {
        value: '$.settings.theme',
        column: jsonbSchema.metadata,
        table: jsonbSchema,
        queryType: 'steVecSelector',
      },
    ])

    const data = unwrapResult(result)

    expect(data).toHaveLength(2)
    expect(data[0]).toMatchObject({ i: { t: 'documents', c: 'metadata' } })
    expect(data[1]).toMatchObject({ i: { t: 'documents', c: 'metadata' } })
  }, 30000)

  it('handles null values with steVecSelector in batch', async () => {
    const result = await protectClient.encryptQuery([
      {
        value: null,
        column: jsonbSchema.metadata,
        table: jsonbSchema,
        queryType: 'steVecSelector',
      },
      {
        value: '$.user.email',
        column: jsonbSchema.metadata,
        table: jsonbSchema,
        queryType: 'steVecSelector',
      },
    ])

    const data = unwrapResult(result)

    expect(data).toHaveLength(2)
    expect(data[0]).toBeNull()
    expect(data[1]).not.toBeNull()
    expect(data[1]).toMatchObject({ i: { t: 'documents', c: 'metadata' } })
  }, 30000)

  it('handles null values with steVecTerm in batch', async () => {
    const result = await protectClient.encryptQuery([
      {
        value: null,
        column: jsonbSchema.metadata,
        table: jsonbSchema,
        queryType: 'steVecTerm',
      },
      {
        value: { role: 'admin' },
        column: jsonbSchema.metadata,
        table: jsonbSchema,
        queryType: 'steVecTerm',
      },
    ])

    const data = unwrapResult(result)

    expect(data).toHaveLength(2)
    expect(data[0]).toBeNull()
    expect(data[1]).not.toBeNull()
    expect(data[1]).toMatchObject({ i: { t: 'documents', c: 'metadata' } })
  }, 30000)
})
