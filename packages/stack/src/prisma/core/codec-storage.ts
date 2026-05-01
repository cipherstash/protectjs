import type { BulkDecryptPayload, BulkEncryptPayload, Encrypted } from '@/types'
import type { JsPlaintext } from '@cipherstash/protect-ffi'
import type {
  CodecTrait,
  JsonValue,
  SqlCodec,
} from '../internal-types/prisma-next'
import { createBatcher } from './batcher'
import { type CipherStashCodecContext, emitTimed } from './codec-context'
import { ENCRYPTED_STORAGE_CODEC_ID, type EncryptedDataType } from './constants'
import { requireColumnFor } from './encryption-client'
import {
  CipherStashCodecError,
  assertJsTypeMatchesDataType,
  describeJs,
} from './errors'
import { eqlFromCompositeLiteral, eqlToCompositeLiteral } from './wire'

/**
 * Storage codec factory for `eql_v2_encrypted` columns.
 *
 * Wire shape: PostgreSQL composite-literal string `("<escaped-json>")`.
 *
 * The codec is constructed per-extension by `cipherstashEncryption({...})`.
 * Each extension's codec closes over its own `EncryptionClient` binding
 * (no module-level singleton) so multi-tenant deployments can run two
 * extensions with two clients side-by-side without cross-talk.
 *
 * On encode the codec dispatches by the value's JS-runtime data type
 * to a `(table, column)` pair drawn from the contract; the SDK's
 * `bulkEncrypt({ items, table, column })` consumes that and the cipher
 * produced encodes the column's `i.t` / `i.c` metadata. On decode the
 * codec hands the cipher straight to `bulkDecrypt(items)` and trusts
 * the SDK's `cast_as` round-trip — no inspection of the cipher
 * payload.
 */

const STORAGE_TRAITS = ['equality'] as const satisfies readonly CodecTrait[]

/** Per-data-type plaintext marshaling — Date crosses the FFI as ISO string. */
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

/**
 * Produce a fresh storage codec instance bound to the given context.
 */
export function createEncryptedStorageCodec(
  ctx: CipherStashCodecContext,
): SqlCodec<
  typeof ENCRYPTED_STORAGE_CODEC_ID,
  typeof STORAGE_TRAITS,
  string,
  unknown
> {
  // One encrypt-batcher per data type. `bulkEncrypt`'s `EncryptOptions.column`
  // is per-call, so a homogeneous payload per call is cheaper than
  // routing every cell through a single mega-batch.
  const encryptBatchers = new Map<
    EncryptedDataType,
    ReturnType<typeof createBatcher<JsPlaintext, Encrypted>>
  >()

  const encryptBatcherFor = (dataType: EncryptedDataType) => {
    let batcher = encryptBatchers.get(dataType)
    if (batcher) return batcher
    batcher = createBatcher<JsPlaintext, Encrypted>(async (values) => {
      const client = await ctx.binding.getClient()
      const columnBinding = requireColumnFor(ctx.binding, dataType, {
        codecLabel: 'encryptedStorageCodec',
        value: values[0],
      })
      const payload: BulkEncryptPayload = values.map((plaintext, idx) => ({
        id: String(idx),
        plaintext,
      }))
      const result = await emitTimed(
        ctx,
        {
          kind: 'bulkEncrypt',
          codecId: ENCRYPTED_STORAGE_CODEC_ID,
          batchSize: values.length,
          table: columnBinding.table.tableName,
          column: columnBinding.columnName,
        },
        () =>
          client.bulkEncrypt(payload, {
            column: columnBinding.column,
            table: columnBinding.table,
          }),
      )
      if (result.failure) {
        throw new CipherStashCodecError({
          code: 'DECODE_ROUND_TRIP_BROKEN',
          message: `bulkEncrypt failed: ${result.failure.message}`,
          column: columnBinding.columnName,
          expectedDataType: dataType,
          actualType: 'unknown',
          cause: result.failure,
        })
      }
      return result.data.map((item) => item.data)
    })
    encryptBatchers.set(dataType, batcher)
    return batcher
  }

  // Single decrypt batcher; the SDK's `bulkDecrypt` does not require
  // a `(table, column)` argument — every cipher carries its own
  // `i.t` / `i.c` schema marker which the FFI consults to pick the
  // right `cast_as` for the round-trip.
  const decryptBatcher = createBatcher<Encrypted, unknown>(async (values) => {
    const client = await ctx.binding.getClient()
    const payload: BulkDecryptPayload = values.map((data, idx) => ({
      id: String(idx),
      data,
    }))
    const head = values[0]
    const result = await emitTimed(
      ctx,
      {
        kind: 'bulkDecrypt',
        codecId: ENCRYPTED_STORAGE_CODEC_ID,
        batchSize: values.length,
        table: head?.i.t,
        column: head?.i.c,
      },
      () => client.bulkDecrypt(payload),
    )
    if (result.failure) {
      throw new CipherStashCodecError({
        code: 'DECODE_ROUND_TRIP_BROKEN',
        message: `bulkDecrypt failed: ${result.failure.message}`,
        column: head?.i.c,
        expectedDataType: undefined,
        actualType: 'unknown',
        cause: result.failure,
      })
    }
    return result.data.map((item, idx) => {
      if ('error' in item && item.error) {
        const cipher = values[idx]
        throw new CipherStashCodecError({
          code: 'DECODE_ROUND_TRIP_BROKEN',
          message: `Decryption failed for row index ${idx}: ${item.error}`,
          column: cipher?.i.c,
          expectedDataType: undefined,
          actualType: 'unknown',
          cause: item.error,
        })
      }
      // Trust the SDK: it honors the column's `cast_as` config and
      // returns the right JS type already (Date for 'date', etc.).
      return item.data
    })
  })

  return {
    id: ENCRYPTED_STORAGE_CODEC_ID,
    targetTypes: ['csEncrypted'],
    traits: STORAGE_TRAITS,
    meta: {
      db: {
        sql: {
          postgres: {
            // Bare identifier — matches Drizzle's precedent and the
            // qualified form in `constants.ts:ENCRYPTED_NATIVE_TYPE`
            // is the descriptor / packMeta surface only. Keeping the
            // codec meta unqualified avoids the introspection
            // round-trip diff documented in F-19.
            nativeType: 'eql_v2_encrypted',
          },
        },
      },
    },

    async encode(value: unknown): Promise<string> {
      // The codec doesn't see the contract column's declared dataType
      // at this site (Prisma Next runtime gap), so the JS-runtime
      // type is the dispatch key. Unsupported types (bigint, symbol,
      // function) raise a structured `UNSUPPORTED_PLAINTEXT_TYPE`.
      const dataType = assertJsTypeMatchesDataType(value, undefined)
      const plaintext = toPlaintext(value, dataType)
      const encrypted = await encryptBatcherFor(dataType).enqueue(plaintext)
      return eqlToCompositeLiteral(encrypted)
    },

    async decode(wire: string): Promise<unknown> {
      const encrypted = eqlFromCompositeLiteral(wire)
      return decryptBatcher.enqueue(encrypted)
    },

    encodeJson(value: unknown): JsonValue {
      if (value instanceof Date) return value.toISOString()
      return value as JsonValue
    },
    decodeJson(json: JsonValue): unknown {
      return json
    },

    /**
     * Rendered into the generated `contract.d.ts` file when the
     * contract emitter wants the JS type for an encrypted column.
     * Dispatches on `typeParams.dataType` so `Decrypted<T>` resolves
     * to the correct JS type per column.
     */
    renderOutputType(typeParams: Record<string, unknown>): string {
      const dataType = typeParams.dataType
      switch (dataType) {
        case 'number':
          return 'number'
        case 'boolean':
          return 'boolean'
        case 'date':
          return 'Date'
        case 'json':
          return 'unknown'
        case 'string':
        case undefined:
          return 'string'
        default:
          throw new Error(
            `Unsupported dataType in encrypted column typeParams: ${String(
              dataType,
            )}`,
          )
      }
    },
  }
}
