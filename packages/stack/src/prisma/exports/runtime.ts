import type { EncryptionClient } from '@/encryption'
import { encryptedStorageParamsSchema } from '../core/authoring'
import {
  type CipherStashCodecContext,
  type CipherStashEncryptionEvent,
  type CipherStashEncryptionEventHook,
  type CipherStashEncryptionEventKind,
  defaultEventHook,
} from '../core/codec-context'
import { createEncryptionCodecRegistry } from '../core/codec-registry'
import {
  ENCRYPTED_STORAGE_CODEC_ID,
  PACK_ID,
  PACK_VERSION,
} from '../core/constants'
import { createEncryptionBinding } from '../core/encryption-client'
import { type ContractLike, extractEncryptedSchemas } from '../core/extraction'
import { encryptedQueryOperations } from '../core/operation-templates'
import type {
  RuntimeParameterizedCodecDescriptor,
  SqlRuntimeExtensionDescriptor,
} from '../internal-types/prisma-next'

export type { ContractLike } from '../core/extraction'
export type {
  CipherStashEncryptionEvent,
  CipherStashEncryptionEventKind,
} from '../core/codec-context'

/**
 * Options accepted by the runtime extension factory.
 */
export interface CipherStashEncryptionOptions {
  /**
   * Pre-constructed `EncryptionClient` to bind into this extension
   * instance. Each extension instance closes over its own client; two
   * `cipherstashEncryption(...)` calls produce two independent codec
   * graphs with no cross-talk.
   *
   * When omitted, the extension lazy-constructs a default client from
   * the standard `CS_*` env vars on first encrypt/decrypt. The
   * required env vars are validated synchronously at extension
   * construction time so missing config surfaces in the dev-server
   * boot log, not deep inside a codec call.
   */
  readonly encryptionClient?: EncryptionClient

  /**
   * Prisma Next contract used to derive the per-column
   * `EncryptedTable` registrations the default `EncryptionClient` is
   * initialized with. Every `(table, column)` pair the contract
   * declares as encrypted gets its own schema entry with the right
   * index configuration.
   *
   * Required when `encryptionClient` is omitted and any encrypted
   * column will be exercised — without a contract there are no
   * schemas to register and no `(table, column)` pair to thread
   * through to the SDK.
   */
  readonly contract?: ContractLike

  /**
   * Optional hook invoked on every SDK round-trip — both success and
   * failure. Receives a structured `CipherStashEncryptionEvent` with
   * `{ kind, codecId, batchSize, durationMs, table, column, error }`.
   *
   * When omitted, the extension's default behaviour is:
   *   - production (`NODE_ENV === 'production'`): no-op.
   *   - development / test: `console.debug(...)` per round-trip.
   *
   * Use this for application metrics, distributed tracing, or
   * structured logging. The payload deliberately omits plaintext /
   * ciphertext so default dev logging is safe.
   */
  readonly onEvent?: CipherStashEncryptionEventHook
}

const parameterizedCodecs: readonly RuntimeParameterizedCodecDescriptor[] = [
  {
    codecId: ENCRYPTED_STORAGE_CODEC_ID,
    paramsSchema: encryptedStorageParamsSchema,
  },
]

/**
 * Runtime extension factory.
 *
 * Each call returns a fresh descriptor with its own `EncryptionClient`
 * binding closed inside the codec graph. There is no module-level
 * singleton; multi-tenant deployments construct one extension per
 * tenant scope and never see cross-talk between them.
 *
 * The factory eagerly:
 *   - validates the required env vars (when no `encryptionClient` is
 *     supplied) and throws a synchronous `CipherStashCodecError`
 *     listing every missing variable;
 *   - extracts encrypted-table schemas from the contract so the
 *     default client is initialized with real `(table, column)`
 *     entries.
 */
export function cipherstashEncryption(
  options: CipherStashEncryptionOptions = {},
): SqlRuntimeExtensionDescriptor<'postgres'> {
  const schemas = extractEncryptedSchemas(options.contract)
  const binding = createEncryptionBinding({
    client: options.encryptionClient,
    schemas,
  })
  const emit = options.onEvent ?? defaultEventHook
  const ctx: CipherStashCodecContext = {
    binding,
    emit: (event: CipherStashEncryptionEvent) => emit(event),
  }

  return {
    kind: 'extension',
    id: PACK_ID,
    version: PACK_VERSION,
    familyId: 'sql',
    targetId: 'postgres',
    codecs: () => createEncryptionCodecRegistry(ctx),
    queryOperations: () => encryptedQueryOperations,
    parameterizedCodecs: () => parameterizedCodecs,
    create: () => ({
      familyId: 'sql' as const,
      targetId: 'postgres' as const,
    }),
  }
}

export default cipherstashEncryption
