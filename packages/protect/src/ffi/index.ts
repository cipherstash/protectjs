import { type Result, withResult } from '@byteslice/result'
import { type JsPlaintext, newClient } from '@cipherstash/protect-ffi'
import {
  type EncryptConfig,
  type ProtectTable,
  type ProtectTableColumn,
  encryptConfigSchema,
} from '@cipherstash/schema'
import { type ProtectError, ProtectErrorTypes } from '..'
import { loadWorkSpaceId } from '../../../utils/config'
import { logger } from '../../../utils/logger'
import { toFfiKeysetIdentifier } from '../helpers'
import type {
  BulkDecryptPayload,
  BulkEncryptPayload,
  Client,
  Decrypted,
  EncryptOptions,
  Encrypted,
  KeysetIdentifier,
  SearchTerm,
} from '../types'
import { BulkDecryptOperation } from './operations/bulk-decrypt'
import { BulkDecryptModelsOperation } from './operations/bulk-decrypt-models'
import { BulkEncryptOperation } from './operations/bulk-encrypt'
import { BulkEncryptModelsOperation } from './operations/bulk-encrypt-models'
import { DecryptOperation } from './operations/decrypt'
import { DecryptModelOperation } from './operations/decrypt-model'
import { EncryptOperation } from './operations/encrypt'
import { EncryptModelOperation } from './operations/encrypt-model'
import { SearchTermsOperation } from './operations/search-terms'

/**
 * Construct the standard error thrown when an operation is invoked before the
 * native Protect client is initialised. Framework integrations can reuse this
 * helper to deliver consistent messaging.
 */
export const noClientError = () =>
  new Error(
    'The EQL client has not been initialized. Please call init() before using the client.',
  )

/**
 * Runtime wrapper around the native Protect.js client exposed via
 * `@cipherstash/protect-ffi`. Provides ergonomic, typed operations that return
 * Result-like objects aligned with CipherStash’s enterprise support promises.
 *
 * @remarks
 * - Schema validation: `init` validates the encrypt configuration with Zod, so
 *   calling code receives immediate feedback if table definitions drift from
 *   the contract documented at https://cipherstash.com/.
 * - Logging: Uses the shared CipherStash logger to emit zero-plaintext audit
 *   events, helping teams satisfy SOC2, HIPAA, and GDPR evidence requirements.
 * - Key management: Supports keyset scoping so multi-tenant workloads can route
 *   through isolated key hierarchies without redeploying infrastructure.
 */
export class ProtectClient {
  private client: Client
  private encryptConfig: EncryptConfig | undefined
  private workspaceId: string | undefined

  constructor(workspaceCrn?: string) {
    const workspaceId = loadWorkSpaceId(workspaceCrn)
    this.workspaceId = workspaceId
  }

  /**
   * Initialise the underlying native client, synchronising schema metadata with
   * CipherStash ZeroKMS and preparing the high-performance encryption pipeline.
   *
   * @param config - Credentials, schema definition, and optional keyset
   *   descriptor used to scope the tenant key hierarchy.
   * @returns A Result whose `data` branch is the ready-to-use `ProtectClient`.
   */
  async init(config: {
    encryptConfig: EncryptConfig
    workspaceCrn?: string
    accessKey?: string
    clientId?: string
    clientKey?: string
    keyset?: KeysetIdentifier
  }): Promise<Result<ProtectClient, ProtectError>> {
    return await withResult(
      async () => {
        const validated: EncryptConfig = encryptConfigSchema.parse(
          config.encryptConfig,
        )

        logger.debug(
          'Initializing the Protect.js client with the following encrypt config:',
          {
            encryptConfig: validated,
          },
        )

        this.client = await newClient({
          encryptConfig: validated,
          clientOpts: {
            workspaceCrn: config.workspaceCrn,
            accessKey: config.accessKey,
            clientId: config.clientId,
            clientKey: config.clientKey,
            keyset: toFfiKeysetIdentifier(config.keyset),
          },
        })

        this.encryptConfig = validated

        logger.info('Successfully initialized the Protect.js client.')
        return this
      },
      (error: unknown) => ({
        type: ProtectErrorTypes.ClientInitError,
        message: (error as Error).message,
      }),
    )
  }

  /**
   * Encrypt a single plaintext value using the configured schema metadata.
   *
   * @remarks
   * - Returns a thenable operation so you can optionally chain
   *   `.withLockContext()` for identity-aware encryption.
   * - Uses CipherStash ZeroKMS bulk APIs under the hood, even for single values,
   *   to guarantee consistent performance at scale.
   *
   * @param plaintext - The value to encrypt; accepts strings, structured JSON,
   *   or `null`.
   * @param opts - Table/column context that aligns with your `csTable`
   *   definition.
   * @returns A thenable operation resolving to `Result<Encrypted, ProtectError>`.
   */
  encrypt(
    plaintext: JsPlaintext | null,
    opts: EncryptOptions,
  ): EncryptOperation {
    return new EncryptOperation(this.client, plaintext, opts)
  }

  /**
   * Decrypt an encrypted payload back to plaintext form. Supports optional lock
   * contexts to enforce identity-aware access controls.
   *
   * @param encryptedData - The EQL payload retrieved from storage.
   * @returns A thenable operation resolving to `Result<JsPlaintext | null, ProtectError>`.
   */
  decrypt(encryptedData: Encrypted): DecryptOperation {
    return new DecryptOperation(this.client, encryptedData)
  }

  /**
   * Encrypt every matching field on a structured model using the schema mapped
   * to the supplied Protect table.
   *
   * @param input - Plaintext model whose keys align with the Protect table.
   * @param table - Protect table definition returned by `csTable`.
   * @returns A thenable bulk operation that resolves to encrypted models.
   */
  encryptModel<T extends Record<string, unknown>>(
    input: Decrypted<T>,
    table: ProtectTable<ProtectTableColumn>,
  ): EncryptModelOperation<T> {
    return new EncryptModelOperation(this.client, input, table)
  }

  /**
   * Decrypt an encrypted model, returning human-readable values while leaving
   * non-encrypted fields untouched.
   *
   * @param input - Model containing encrypted payloads.
   * @returns A thenable operation resolving to decrypted models.
   */
  decryptModel<T extends Record<string, unknown>>(
    input: T,
  ): DecryptModelOperation<T> {
    return new DecryptModelOperation(this.client, input)
  }

  /**
   * Encrypt an array of models in a single network round-trip, optimised for
   * ingestion workloads and high-throughput pipelines.
   *
   * @param input - Collection of decrypted models.
   * @param table - Protect table definition.
   * @returns A thenable bulk operation.
   */
  bulkEncryptModels<T extends Record<string, unknown>>(
    input: Array<Decrypted<T>>,
    table: ProtectTable<ProtectTableColumn>,
  ): BulkEncryptModelsOperation<T> {
    return new BulkEncryptModelsOperation(this.client, input, table)
  }

  /**
   * Decrypt multiple models at once, handling partial failures with per-record
   * error reporting.
   *
   * @param input - Array of encrypted models.
   * @returns A thenable bulk operation.
   */
  bulkDecryptModels<T extends Record<string, unknown>>(
    input: Array<T>,
  ): BulkDecryptModelsOperation<T> {
    return new BulkDecryptModelsOperation(this.client, input)
  }

  /**
   * Encrypt many scalar values in one request. Useful for backfills or ETL jobs
   * that need deterministic correlation using `id` fields.
   *
   * @param plaintexts - Payload describing the values to encrypt.
   * @param opts - Column and table context.
   * @returns A thenable bulk operation.
   */
  bulkEncrypt(
    plaintexts: BulkEncryptPayload,
    opts: EncryptOptions,
  ): BulkEncryptOperation {
    return new BulkEncryptOperation(this.client, plaintexts, opts)
  }

  /**
   * Decrypt many scalar values in one request. Each item in the Result payload
   * carries either decrypted data or an error message for granular retries.
   *
   * @param encryptedPayloads - Encrypted values to decrypt.
   * @returns A thenable bulk operation.
   */
  bulkDecrypt(encryptedPayloads: BulkDecryptPayload): BulkDecryptOperation {
    return new BulkDecryptOperation(this.client, encryptedPayloads)
  }

  /**
   * Generate encrypted search terms suitable for PostgreSQL equality, range,
   * and match indexes. This preserves zero-trust guarantees while enabling rich
   * querying.
   *
   * @param terms - Plaintext values aligned with their Protect schema metadata.
   * @returns A thenable operation yielding encrypted search tokens.
   */
  createSearchTerms(terms: SearchTerm[]): SearchTermsOperation {
    return new SearchTermsOperation(this.client, terms)
  }

  /**
   * Diagnostic helper that surfaces minimal workspace metadata. Exposed so
   * monitoring hooks can confirm which workspace (and therefore compliance
   * boundary) the client is operating within.
   */
  clientInfo() {
    return {
      workspaceId: this.workspaceId,
    }
  }
}
