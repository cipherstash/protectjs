import type { Encrypted, ScalarQueryTerm } from '@/types'
import type { JsPlaintext } from '@cipherstash/protect-ffi'
import type {
  CodecTrait,
  JsonValue,
  SqlCodec,
} from '../internal-types/prisma-next'
import { createBatcher } from './batcher'
import { type CipherStashCodecContext, emitTimed } from './codec-context'
import { ENCRYPTED_STE_VEC_SELECTOR_CODEC_ID } from './constants'
import { requireColumnFor } from './encryption-client'
import { CipherStashCodecError, describeJs, inferJsDataType } from './errors'
import { eqlToCompositeLiteral } from './wire'

/**
 * STE-Vec selector query-term codec factory.
 *
 * Used as the value-side codec for `jsonbPathExists` /
 * `jsonbPathQueryFirst` / `jsonbGet` operations on encrypted JSON
 * columns whose `typeParams.searchableJson` is `true`.
 *
 * The plaintext is a JSONPath selector string (e.g. `'$.user.email'`).
 */

const STE_VEC_TRAITS = [] as const satisfies readonly CodecTrait[]

export function createEncryptedSteVecSelectorCodec(
  ctx: CipherStashCodecContext,
): SqlCodec<
  typeof ENCRYPTED_STE_VEC_SELECTOR_CODEC_ID,
  typeof STE_VEC_TRAITS,
  string,
  string
> {
  const batcher = createBatcher<JsPlaintext, Encrypted>(async (values) => {
    const client = await ctx.binding.getClient()
    const columnBinding = requireColumnFor(ctx.binding, 'json', {
      codecLabel: 'encryptedSteVecSelectorCodec',
      value: values[0],
    })
    const terms: ScalarQueryTerm[] = values.map((value) => ({
      value: value as ScalarQueryTerm['value'],
      column: columnBinding.column,
      table: columnBinding.table,
      queryType: 'steVecSelector',
    }))
    const result = await emitTimed(
      ctx,
      {
        kind: 'encryptQuery',
        codecId: ENCRYPTED_STE_VEC_SELECTOR_CODEC_ID,
        batchSize: values.length,
        table: columnBinding.table.tableName,
        column: columnBinding.columnName,
      },
      () => client.encryptQuery(terms),
    )
    if (result.failure) {
      throw new CipherStashCodecError({
        code: 'INVALID_QUERY_TERM',
        message: `encryptQuery (steVecSelector) failed: ${result.failure.message}`,
        column: columnBinding.columnName,
        expectedDataType: 'string',
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

  return {
    id: ENCRYPTED_STE_VEC_SELECTOR_CODEC_ID,
    targetTypes: ['csEncryptedSteVecSelector'],
    traits: STE_VEC_TRAITS,
    meta: {
      db: {
        sql: {
          postgres: {
            nativeType: 'eql_v2_encrypted',
          },
        },
      },
    },

    async encode(value: string): Promise<string> {
      const jsDataType = inferJsDataType(value)
      if (jsDataType !== 'string') {
        throw new CipherStashCodecError({
          code: 'JS_TYPE_MISMATCH',
          message: `STE-Vec selector codec only accepts string plaintexts, got JS type '${jsDataType ?? describeJs(value)}'`,
          column: undefined,
          expectedDataType: 'string',
          actualType: jsDataType ?? describeJs(value),
        })
      }
      const encrypted = await batcher.enqueue(value)
      return eqlToCompositeLiteral(encrypted)
    },

    async decode(_wire: string): Promise<string> {
      throw new Error(
        'cs/eql_v2_ste_vec_selector@1 is a write-only query-term codec; decode must not be called',
      )
    },

    encodeJson(value: string): JsonValue {
      return value
    },
    decodeJson(json: JsonValue): string {
      if (typeof json !== 'string') {
        throw new TypeError(
          `Expected string in ste-vec selector JSON value, got ${typeof json}`,
        )
      }
      return json
    },
  }
}
