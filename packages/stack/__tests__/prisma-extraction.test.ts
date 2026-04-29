import { ENCRYPTED_STORAGE_CODEC_ID } from '@/prisma/core/constants'
import {
  type ContractLike,
  extractEncryptedSchemas,
} from '@/prisma/core/extraction'
import { describe, expect, it } from 'vitest'

/**
 * Phase 3 deliverable #7: walk a Prisma Next contract's storage layout
 * and produce one `EncryptedTable` per table that holds at least one
 * encrypted column. Each derived `EncryptedTable` carries the per-column
 * index configuration verbatim from the contract's typeParams.
 */

describe('extractEncryptedSchemas', () => {
  it('returns an empty array for an undefined or empty contract', () => {
    expect(extractEncryptedSchemas(undefined)).toEqual([])
    expect(extractEncryptedSchemas(null)).toEqual([])
    expect(extractEncryptedSchemas({})).toEqual([])
    expect(extractEncryptedSchemas({ storage: {} })).toEqual([])
    expect(extractEncryptedSchemas({ storage: { tables: {} } })).toEqual([])
  })

  it('skips columns whose codecId is not the encrypted-storage codec', () => {
    const contract: ContractLike = {
      storage: {
        tables: {
          users: {
            columns: {
              id: { codecId: 'pg/int4@1', nativeType: 'integer' },
              name: { codecId: 'pg/text@1', nativeType: 'text' },
            },
          },
        },
      },
    }
    expect(extractEncryptedSchemas(contract)).toEqual([])
  })

  it('builds one EncryptedTable per table with at least one encrypted column', () => {
    const contract: ContractLike = {
      storage: {
        tables: {
          users: {
            columns: {
              id: { codecId: 'pg/int4@1' },
              email: {
                codecId: ENCRYPTED_STORAGE_CODEC_ID,
                typeParams: {
                  dataType: 'string',
                  equality: true,
                  freeTextSearch: true,
                  orderAndRange: false,
                  searchableJson: false,
                },
              },
            },
          },
          posts: {
            columns: {
              id: { codecId: 'pg/int4@1' },
              author_id: { codecId: 'pg/int4@1' },
            },
          },
        },
      },
    }
    const tables = extractEncryptedSchemas(contract)
    // Only `users` has an encrypted column; `posts` is omitted entirely.
    expect(tables).toHaveLength(1)
    expect(tables[0]?.tableName).toBe('users')
  })

  it('projects searchable-encryption flags onto the EncryptedColumn builder', () => {
    const contract: ContractLike = {
      storage: {
        tables: {
          users: {
            columns: {
              email: {
                codecId: ENCRYPTED_STORAGE_CODEC_ID,
                typeParams: {
                  dataType: 'string',
                  equality: true,
                  freeTextSearch: true,
                  orderAndRange: false,
                  searchableJson: false,
                },
              },
              age: {
                codecId: ENCRYPTED_STORAGE_CODEC_ID,
                typeParams: {
                  dataType: 'number',
                  equality: false,
                  freeTextSearch: false,
                  orderAndRange: true,
                  searchableJson: false,
                },
              },
              profile: {
                codecId: ENCRYPTED_STORAGE_CODEC_ID,
                typeParams: {
                  dataType: 'json',
                  equality: false,
                  freeTextSearch: false,
                  orderAndRange: false,
                  searchableJson: true,
                },
              },
            },
          },
        },
      },
    }
    const [users] = extractEncryptedSchemas(contract)
    expect(users).toBeDefined()
    if (!users) return
    const built = users.build()
    // build() returns { tableName, columns: { email: { cast_as, indexes }, ... } }
    expect(built.tableName).toBe('users')
    expect(built.columns.email?.indexes.unique).toBeDefined()
    expect(built.columns.email?.indexes.match).toBeDefined()
    expect(built.columns.age?.indexes.ore).toBeDefined()
    expect(built.columns.profile?.indexes.ste_vec).toBeDefined()
  })

  it('resolves typeParams via typeRef when the column inlines no params', () => {
    const contract: ContractLike = {
      storage: {
        tables: {
          users: {
            columns: {
              email: { typeRef: 'EncryptedEmail' },
            },
          },
        },
        types: {
          EncryptedEmail: {
            codecId: ENCRYPTED_STORAGE_CODEC_ID,
            nativeType: '"public"."eql_v2_encrypted"',
            typeParams: {
              dataType: 'string',
              equality: true,
              freeTextSearch: false,
              orderAndRange: false,
              searchableJson: false,
            },
          },
        },
      },
    }
    const [users] = extractEncryptedSchemas(contract)
    expect(users).toBeDefined()
    const built = users?.build()
    expect(built?.columns.email?.indexes.unique).toBeDefined()
    expect(built?.columns.email?.indexes.match).toBeUndefined()
  })

  it('skips columns whose typeParams.dataType is missing or invalid', () => {
    const contract: ContractLike = {
      storage: {
        tables: {
          users: {
            columns: {
              ok: {
                codecId: ENCRYPTED_STORAGE_CODEC_ID,
                typeParams: {
                  dataType: 'string',
                  equality: true,
                  freeTextSearch: false,
                  orderAndRange: false,
                  searchableJson: false,
                },
              },
              bad: {
                codecId: ENCRYPTED_STORAGE_CODEC_ID,
                typeParams: {
                  dataType: 'unknown-shape',
                  equality: true,
                  freeTextSearch: false,
                  orderAndRange: false,
                  searchableJson: false,
                },
              },
            },
          },
        },
      },
    }
    const [users] = extractEncryptedSchemas(contract)
    expect(users).toBeDefined()
    const built = users?.build()
    expect(Object.keys(built?.columns ?? {})).toEqual(['ok'])
  })

  it('ignores searchableJson on non-json columns and freeTextSearch on non-string columns', () => {
    // The contract types prevent these mismatches from being authored,
    // but a hand-crafted contract.json could carry either. The
    // extractor is defensive: it only applies a flag when it makes
    // sense for the column's dataType.
    const contract: ContractLike = {
      storage: {
        tables: {
          weird: {
            columns: {
              n: {
                codecId: ENCRYPTED_STORAGE_CODEC_ID,
                typeParams: {
                  dataType: 'number',
                  equality: false,
                  freeTextSearch: true, // should be ignored
                  orderAndRange: false,
                  searchableJson: true, // should be ignored
                },
              },
            },
          },
        },
      },
    }
    const [tbl] = extractEncryptedSchemas(contract)
    const built = tbl?.build()
    expect(built?.columns.n?.indexes.match).toBeUndefined()
    expect(built?.columns.n?.indexes.ste_vec).toBeUndefined()
  })
})
