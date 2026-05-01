import type { Encrypted, ScalarQueryTerm } from '@/types'
import type { JsPlaintext } from '@cipherstash/protect-ffi'
import type {
  CodecTrait,
  JsonValue,
  SqlCodec,
} from '../internal-types/prisma-next'
import { createBatcher } from './batcher'
import { type CipherStashCodecContext, emitTimed } from './codec-context'
import { ENCRYPTED_EQ_TERM_CODEC_ID, type EncryptedDataType } from './constants'
import { requireColumnFor } from './encryption-client'
import {
  CipherStashCodecError,
  assertJsTypeMatchesDataType,
  describeJs,
} from './errors'
import { eqlToCompositeLiteral } from './wire'

/**
 * Equality query-term codec factory.
 *
 * Used as the value-side codec for `eq` / `neq` / `inArray` operations
 * on encrypted columns. Routes through
 * `encryptionClient.encryptQuery({ queryType: 'equality' })` which
 * emits only the EQ index (HMAC-SHA256 hash) rather than a full
 * ciphertext.
 *
 * Date plaintexts cross the FFI as ISO strings under `cast_as: 'date'`,
 * mirroring the storage codec.
 */

const EQ_TERM_TRAITS = [] as const satisfies readonly CodecTrait[]

function toPlaintext(value: unknown, dataType: EncryptedDataType): JsPlaintext {
  if (dataType === 'date') {
    if (!(value instanceof Date)) {
      throw new TypeError(
        `Expected Date for dataType 'date', got ${describeJs(value)}`,
      )
    }
    return value.toISOString()
  }
  return value as JsPlaintext
}

export function createEncryptedEqTermCodec(
  ctx: CipherStashCodecContext,
): SqlCodec<
  typeof ENCRYPTED_EQ_TERM_CODEC_ID,
  typeof EQ_TERM_TRAITS,
  string,
  unknown
> {
  const batchersByDataType = new Map<
    EncryptedDataType,
    ReturnType<typeof createBatcher<JsPlaintext, Encrypted>>
  >()

  const batcherFor = (dataType: EncryptedDataType) => {
    let batcher = batchersByDataType.get(dataType)
    if (batcher) return batcher
    batcher = createBatcher<JsPlaintext, Encrypted>(async (values) => {
      const client = await ctx.binding.getClient()
      const columnBinding = requireColumnFor(ctx.binding, dataType, {
        codecLabel: 'encryptedEqTermCodec',
        value: values[0],
      })
      const terms: ScalarQueryTerm[] = values.map((value) => ({
        value: value as ScalarQueryTerm['value'],
        column: columnBinding.column,
        table: columnBinding.table,
        queryType: 'equality',
      }))
      const result = await emitTimed(
        ctx,
        {
          kind: 'encryptQuery',
          codecId: ENCRYPTED_EQ_TERM_CODEC_ID,
          batchSize: values.length,
          table: columnBinding.table.tableName,
          column: columnBinding.columnName,
        },
        () => client.encryptQuery(terms),
      )
      if (result.failure) {
        throw new CipherStashCodecError({
          code: 'INVALID_QUERY_TERM',
          message: `encryptQuery (equality) failed: ${result.failure.message}`,
          column: columnBinding.columnName,
          expectedDataType: dataType,
          actualType: 'unknown',
          cause: result.failure,
        })
      }
      return result.data.map((item) => {
        if (typeof item === 'string') {
          throw new TypeError(
            'encryptQuery returned composite literal where Encrypted was expected',
          )
        }
        return item
      })
    })
    batchersByDataType.set(dataType, batcher)
    return batcher
  }

  return {
    id: ENCRYPTED_EQ_TERM_CODEC_ID,
    targetTypes: ['csEncryptedEqTerm'],
    traits: EQ_TERM_TRAITS,
    meta: {
      db: {
        sql: {
          postgres: {
            nativeType: 'eql_v2_encrypted',
          },
        },
      },
    },

    async encode(value: unknown): Promise<string> {
      const dataType = assertJsTypeMatchesDataType(value, undefined)
      const plaintext = toPlaintext(value, dataType)
      const encrypted = await batcherFor(dataType).enqueue(plaintext)
      return eqlToCompositeLiteral(encrypted)
    },

    async decode(_wire: string): Promise<unknown> {
      throw new Error(
        'cs/eql_v2_eq_term@1 is a write-only query-term codec; decode must not be called',
      )
    },

    encodeJson(value: unknown): JsonValue {
      if (value instanceof Date) return value.toISOString()
      return value as JsonValue
    },
    decodeJson(json: JsonValue): unknown {
      return json
    },
  }
}
