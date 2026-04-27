import type { Encrypted, ScalarQueryTerm } from '@/types'
import type { JsPlaintext } from '@cipherstash/protect-ffi'
import type {
  CodecTrait,
  JsonValue,
  SqlCodec,
} from '../internal-types/prisma-next'
import { createBatcher } from './batcher'
import { type CipherStashCodecContext, emitTimed } from './codec-context'
import { ENCRYPTED_MATCH_TERM_CODEC_ID } from './constants'
import { requireColumnFor } from './encryption-client'
import { CipherStashCodecError, describeJs, inferJsDataType } from './errors'
import { eqlToCompositeLiteral } from './wire'

/**
 * Free-text-search query-term codec factory.
 *
 * Used as the value-side codec for `like` / `ilike` / `notIlike`
 * operations on encrypted columns whose `typeParams.freeTextSearch` is
 * `true`. Routes through
 * `encryptionClient.encryptQuery({ queryType: 'freeTextSearch' })`
 * which emits the bloom-filter-based MATCH index. Free-text search is
 * meaningful on string plaintexts only.
 */

const MATCH_TERM_TRAITS = [] as const satisfies readonly CodecTrait[]

export function createEncryptedMatchTermCodec(
  ctx: CipherStashCodecContext,
): SqlCodec<
  typeof ENCRYPTED_MATCH_TERM_CODEC_ID,
  typeof MATCH_TERM_TRAITS,
  string,
  string
> {
  const batcher = createBatcher<JsPlaintext, Encrypted>(async (values) => {
    const client = await ctx.binding.getClient()
    const columnBinding = requireColumnFor(ctx.binding, 'string', {
      codecLabel: 'encryptedMatchTermCodec',
      value: values[0],
    })
    const terms: ScalarQueryTerm[] = values.map((value) => ({
      value: value as ScalarQueryTerm['value'],
      column: columnBinding.column,
      table: columnBinding.table,
      queryType: 'freeTextSearch',
    }))
    const result = await emitTimed(
      ctx,
      {
        kind: 'encryptQuery',
        codecId: ENCRYPTED_MATCH_TERM_CODEC_ID,
        batchSize: values.length,
        table: columnBinding.table.tableName,
        column: columnBinding.columnName,
      },
      () => client.encryptQuery(terms),
    )
    if (result.failure) {
      throw new CipherStashCodecError({
        code: 'INVALID_QUERY_TERM',
        message: `encryptQuery (freeTextSearch) failed: ${result.failure.message}`,
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
    id: ENCRYPTED_MATCH_TERM_CODEC_ID,
    targetTypes: ['csEncryptedMatchTerm'],
    traits: MATCH_TERM_TRAITS,
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
          message: `Match-term codec only accepts string plaintexts, got JS type '${jsDataType ?? describeJs(value)}'`,
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
        'cs/eql_v2_match_term@1 is a write-only query-term codec; decode must not be called',
      )
    },

    encodeJson(value: string): JsonValue {
      return value
    },
    decodeJson(json: JsonValue): string {
      if (typeof json !== 'string') {
        throw new TypeError(
          `Expected string in match-term JSON value, got ${typeof json}`,
        )
      }
      return json
    },
  }
}
