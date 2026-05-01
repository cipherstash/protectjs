import type { Encrypted, ScalarQueryTerm } from '@/types'
import type { JsPlaintext } from '@cipherstash/protect-ffi'
import type {
  CodecTrait,
  JsonValue,
  SqlCodec,
} from '../internal-types/prisma-next'
import { createBatcher } from './batcher'
import { type CipherStashCodecContext, emitTimed } from './codec-context'
import {
  ENCRYPTED_ORE_TERM_CODEC_ID,
  type EncryptedDataType,
} from './constants'
import { requireColumnFor } from './encryption-client'
import { CipherStashCodecError, describeJs } from './errors'
import { eqlToCompositeLiteral } from './wire'

/**
 * Order-and-range query-term codec factory.
 *
 * Used as the value-side codec for `gt` / `gte` / `lt` / `lte` /
 * `between` / `notBetween` operations on encrypted columns whose
 * `typeParams.orderAndRange` is `true`. Routes through
 * `encryptionClient.encryptQuery({ queryType: 'orderAndRange' })`,
 * which emits the ORE comparison index.
 *
 * ORE is meaningful for numbers and dates only.
 */

const ORE_TERM_TRAITS = [] as const satisfies readonly CodecTrait[]

function inferOreDataType(value: unknown): EncryptedDataType {
  if (value instanceof Date) return 'date'
  if (typeof value === 'number') return 'number'
  throw new CipherStashCodecError({
    code: 'JS_TYPE_MISMATCH',
    message: `ORE query terms require a number or Date plaintext, got ${describeJs(value)}`,
    column: undefined,
    expectedDataType: 'number',
    actualType: describeJs(value),
  })
}

function toPlaintext(value: unknown, dataType: EncryptedDataType): JsPlaintext {
  if (dataType === 'date') {
    if (!(value instanceof Date)) {
      throw new TypeError('Expected Date for ORE dataType=date')
    }
    return value.toISOString()
  }
  return value as JsPlaintext
}

export function createEncryptedOreTermCodec(
  ctx: CipherStashCodecContext,
): SqlCodec<
  typeof ENCRYPTED_ORE_TERM_CODEC_ID,
  typeof ORE_TERM_TRAITS,
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
        codecLabel: 'encryptedOreTermCodec',
        value: values[0],
      })
      const terms: ScalarQueryTerm[] = values.map((value) => ({
        value: value as ScalarQueryTerm['value'],
        column: columnBinding.column,
        table: columnBinding.table,
        queryType: 'orderAndRange',
      }))
      const result = await emitTimed(
        ctx,
        {
          kind: 'encryptQuery',
          codecId: ENCRYPTED_ORE_TERM_CODEC_ID,
          batchSize: values.length,
          table: columnBinding.table.tableName,
          column: columnBinding.columnName,
        },
        () => client.encryptQuery(terms),
      )
      if (result.failure) {
        throw new CipherStashCodecError({
          code: 'INVALID_QUERY_TERM',
          message: `encryptQuery (orderAndRange) failed: ${result.failure.message}`,
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
    id: ENCRYPTED_ORE_TERM_CODEC_ID,
    targetTypes: ['csEncryptedOreTerm'],
    traits: ORE_TERM_TRAITS,
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
      const dataType = inferOreDataType(value)
      const plaintext = toPlaintext(value, dataType)
      const encrypted = await batcherFor(dataType).enqueue(plaintext)
      return eqlToCompositeLiteral(encrypted)
    },

    async decode(_wire: string): Promise<unknown> {
      throw new Error(
        'cs/eql_v2_ore_term@1 is a write-only query-term codec; decode must not be called',
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
