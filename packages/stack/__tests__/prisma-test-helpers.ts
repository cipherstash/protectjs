import type { EncryptionClient } from '@/encryption'
import type {
  CipherStashCodecContext,
  CipherStashEncryptionEvent,
} from '@/prisma/core/codec-context'
import { ENCRYPTED_STORAGE_CODEC_ID } from '@/prisma/core/constants'
import { createEncryptionBinding } from '@/prisma/core/encryption-client'
import {
  type ContractLike,
  extractEncryptedSchemas,
} from '@/prisma/core/extraction'
import type { Encrypted } from '@/types'
import { vi } from 'vitest'

/**
 * Synthetic Prisma Next contract covering one encrypted column per
 * data type. Codec tests use this to drive the dispatch-by-JS-runtime
 * path without authoring a fake contract per test.
 */
export const ALL_DATATYPES_CONTRACT: ContractLike = {
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
              equality: true,
              freeTextSearch: false,
              orderAndRange: true,
              searchableJson: false,
            },
          },
          isActive: {
            codecId: ENCRYPTED_STORAGE_CODEC_ID,
            typeParams: {
              dataType: 'boolean',
              equality: true,
              freeTextSearch: false,
              orderAndRange: false,
              searchableJson: false,
            },
          },
          createdAt: {
            codecId: ENCRYPTED_STORAGE_CODEC_ID,
            typeParams: {
              dataType: 'date',
              equality: true,
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

/**
 * Mock `EncryptionClient` capturing calls per method. The mock
 * captures the resolved column name from the per-call `EncryptOptions`
 * so tests can assert that the codec dispatched to the right column.
 */
export function createMockEncryptionClient() {
  const bulkEncrypt = vi.fn(
    async (
      payload: ReadonlyArray<{ id?: string; plaintext: unknown }>,
      opts: { column: { getName(): string } | string; table: unknown },
    ): Promise<{
      failure?: never
      data: ReadonlyArray<{ id?: string; data: Encrypted }>
    }> => {
      const columnName =
        typeof opts.column === 'string' ? opts.column : opts.column.getName()
      const tableName =
        typeof opts.table === 'object' &&
        opts.table !== null &&
        'tableName' in opts.table
          ? String((opts.table as { tableName: unknown }).tableName)
          : 'unknown'
      return {
        data: payload.map((p) => ({
          id: p.id,
          data: {
            i: { t: tableName, c: columnName },
            v: 1,
            c: `enc:${String(p.plaintext)}`,
          } satisfies Encrypted,
        })),
      }
    },
  )

  /**
   * Mock decrypt that round-trips by stripping the `enc:` prefix and
   * — when the original plaintext was a Date / number / boolean —
   * coerces back to the right JS type. The real SDK does this via
   * `cast_as`; the mock simulates the same contract.
   */
  const bulkDecrypt = vi.fn(
    async (
      payload: ReadonlyArray<{ id?: string; data: Encrypted }>,
    ): Promise<{
      failure?: never
      data: ReadonlyArray<{ id?: string; data: unknown; error?: never }>
    }> => ({
      data: payload.map((p) => {
        const cipher = p.data.c ?? ''
        const stripped = cipher.startsWith('enc:') ? cipher.slice(4) : cipher
        return { id: p.id, data: stripped }
      }),
    }),
  )

  const encryptQuery = vi.fn(async (terms: unknown) => {
    if (!Array.isArray(terms)) {
      throw new Error('mock encryptQuery only handles batch shape')
    }
    return {
      data: terms.map(
        (t: {
          value: unknown
          column: { getName(): string } | string
          table: unknown
        }) => {
          const columnName =
            typeof t.column === 'string' ? t.column : t.column.getName()
          const tableName =
            typeof t.table === 'object' &&
            t.table !== null &&
            'tableName' in t.table
              ? String((t.table as { tableName: unknown }).tableName)
              : 'unknown'
          return {
            i: { t: tableName, c: columnName },
            v: 1,
            c: `qterm:${String(t.value)}`,
          } satisfies Encrypted
        },
      ),
    }
  })

  const client = {
    bulkEncrypt,
    bulkDecrypt,
    encryptQuery,
  } as unknown as EncryptionClient

  return { client, bulkEncrypt, bulkDecrypt, encryptQuery }
}

export interface TestCodecContextOptions {
  readonly contract?: ContractLike
  readonly client?: EncryptionClient
  readonly emit?: (event: CipherStashEncryptionEvent) => void
}

/**
 * Build a `CipherStashCodecContext` for codec-level tests.
 *
 * Defaults to the synthetic all-data-types contract plus a mock
 * client. Callers can override the contract (to drive the
 * `NO_COLUMN_FOR_DATATYPE` path) or supply a custom event emitter
 * (to assert observability).
 */
export function createTestCodecContext(
  opts: TestCodecContextOptions = {},
): CipherStashCodecContext & {
  readonly emitted: CipherStashEncryptionEvent[]
} {
  const { client = createMockEncryptionClient().client } = opts
  const contract = opts.contract ?? ALL_DATATYPES_CONTRACT
  const schemas = extractEncryptedSchemas(contract)
  const binding = createEncryptionBinding({ client, schemas })
  const emitted: CipherStashEncryptionEvent[] = []
  const emit =
    opts.emit ??
    ((event: CipherStashEncryptionEvent) => {
      emitted.push(event)
    })
  return {
    binding,
    emit,
    get emitted() {
      return emitted
    },
  }
}
