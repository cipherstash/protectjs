import type { ContractColumnRef, ContractTableRef, TableColumns } from '@/contract'
import { getContractTables } from '@/contract'
import { type EncryptionError, EncryptionErrorTypes } from '@/errors'
import {
  type EncryptConfig,
  type EncryptedTable,
  type EncryptedTableColumn,
  type EncryptedColumn,
  encryptConfigSchema,
  buildEncryptConfig,
} from '@/schema'
import type {
  BulkDecryptPayload,
  BulkEncryptPayload,
  Client,
  EncryptOptions,
  EncryptQueryOptions,
  EncryptedFromContract,
  Encrypted,
  KeysetIdentifier,
  ScalarQueryTerm,
  InternalEncryptOptions,
  InternalEncryptQueryOptions,
  InternalScalarQueryTerm,
} from '@/types'
import { loadWorkSpaceId } from '@/utils/config'
import { logger } from '@/utils/logger'
import { type Result, withResult } from '@byteslice/result'
import { type JsPlaintext, newClient } from '@cipherstash/protect-ffi'
import { toFfiKeysetIdentifier } from './helpers'
import { isScalarQueryTermArray } from './helpers/type-guards'
import { BatchEncryptQueryOperation } from './operations/batch-encrypt-query'
import { BulkDecryptOperation } from './operations/bulk-decrypt'
import { BulkDecryptModelsOperation } from './operations/bulk-decrypt-models'
import { BulkEncryptOperation } from './operations/bulk-encrypt'
import { BulkEncryptModelsOperation } from './operations/bulk-encrypt-models'
import { DecryptOperation } from './operations/decrypt'
import { DecryptModelOperation } from './operations/decrypt-model'
import { EncryptOperation } from './operations/encrypt'
import { EncryptModelOperation } from './operations/encrypt-model'
import { EncryptQueryOperation } from './operations/encrypt-query'
import type { EncryptionClientConfig } from '@/types'

export const noClientError = () =>
  new Error(
    'The Encryption client has not been initialized. Please call init() before using the client.',
  )

/** Extract internal column/table from a ContractColumnRef */
function extractColumnRef(ref: ContractColumnRef): InternalEncryptOptions {
  return { column: ref._column, table: ref._table }
}

/** Extract internal query options from contract-based options */
function extractQueryOptions(opts: EncryptQueryOptions): InternalEncryptQueryOptions {
  return {
    column: opts.contract._column as EncryptedColumn,
    table: opts.contract._table,
    queryType: opts.queryType,
    returnType: opts.returnType,
  }
}

/** Extract internal scalar query term from contract-based term */
function extractScalarQueryTerm(term: ScalarQueryTerm): InternalScalarQueryTerm {
  return {
    value: term.value,
    column: term.contract._column as EncryptedColumn,
    table: term.contract._table,
    queryType: term.queryType,
    returnType: term.returnType,
  }
}

/** The EncryptionClient is the main entry point for interacting with the CipherStash Encryption library.
 * It provides methods for encrypting and decrypting individual values, as well as models (objects) and bulk operations.
 *
 * The client must be initialized using the {@link Encryption} function before it can be used.
 */
export class EncryptionClient {
  private client: Client
  private encryptConfig: EncryptConfig | undefined
  private workspaceId: string | undefined

  constructor(workspaceCrn?: string) {
    const workspaceId = loadWorkSpaceId(workspaceCrn)
    this.workspaceId = workspaceId
  }

  /**
   * Initializes the EncryptionClient with the provided configuration.
   * @internal
   * @param config - The configuration object for initializing the client.
   * @returns A promise that resolves to a {@link Result} containing the initialized EncryptionClient or an {@link EncryptionError}.
   **/
  async init(config: {
    encryptConfig: EncryptConfig
    workspaceCrn?: string
    accessKey?: string
    clientId?: string
    clientKey?: string
    keyset?: KeysetIdentifier
  }): Promise<Result<EncryptionClient, EncryptionError>> {
    return await withResult(
      async () => {
        const validated: EncryptConfig = encryptConfigSchema.parse(
          config.encryptConfig,
        )

        logger.debug(
          'Initializing the Encryption client with the following config:',
          {
            encryptConfig: validated,
          },
        )

        this.client = await newClient({
          encryptConfig: validated,
          clientOpts: {
            workspaceCrn: config.workspaceCrn ?? process.env.CS_WORKSPACE_CRN,
            accessKey: config.accessKey ?? process.env.CS_CLIENT_ACCESS_KEY,
            clientId: config.clientId ?? process.env.CS_CLIENT_ID,
            clientKey: config.clientKey ?? process.env.CS_CLIENT_KEY,
            keyset: toFfiKeysetIdentifier(config.keyset),
          },
        })

        this.encryptConfig = validated

        logger.debug('Successfully initialized the Encryption client.')
        return this
      },
      (error: unknown) => ({
        type: EncryptionErrorTypes.ClientInitError,
        message: (error as Error).message,
      }),
    )
  }

  /**
   * Encrypt a value - returns a promise which resolves to an encrypted value.
   *
   * @param plaintext - The plaintext value to be encrypted.
   * @param opts - Options specifying the contract column reference. See {@link EncryptOptions}.
   * @returns An EncryptOperation that can be awaited or chained with additional methods.
   *
   * @example
   * ```typescript
   * import { Encryption, defineContract } from "@cipherstash/stack"
   *
   * const contract = defineContract({
   *   users: {
   *     email: { type: 'string', equality: true },
   *   },
   * })
   *
   * const client = await Encryption({ contract })
   *
   * const result = await client.encrypt("hello@example.com", {
   *   contract: contract.users.email,
   * })
   * ```
   */
  encrypt(plaintext: JsPlaintext, opts: EncryptOptions): EncryptOperation {
    const internal = extractColumnRef(opts.contract)
    return new EncryptOperation(this.client, plaintext, internal)
  }

  /**
   * Encrypt a query value - returns a promise which resolves to an encrypted query value.
   *
   * @param plaintext - The plaintext value to be encrypted for querying.
   * @param opts - Options specifying the contract column reference and optional queryType.
   * @returns An EncryptQueryOperation that can be awaited or chained with additional methods.
   *
   * @example
   * ```typescript
   * const result = await client.encryptQuery("hello@example.com", {
   *   contract: contract.users.email,
   *   queryType: 'equality',
   * })
   * ```
   */
  encryptQuery(
    plaintext: JsPlaintext,
    opts: EncryptQueryOptions,
  ): EncryptQueryOperation

  /**
   * Encrypt multiple values for use in queries (batch operation).
   * @param terms - Array of query terms to encrypt
   */
  encryptQuery(terms: readonly ScalarQueryTerm[]): BatchEncryptQueryOperation

  encryptQuery(
    plaintextOrTerms: JsPlaintext | readonly ScalarQueryTerm[],
    opts?: EncryptQueryOptions,
  ): EncryptQueryOperation | BatchEncryptQueryOperation {
    // Discriminate between ScalarQueryTerm[] and JsPlaintext (which can also be an array)
    if (isScalarQueryTermArray(plaintextOrTerms)) {
      const internalTerms = (plaintextOrTerms as readonly ScalarQueryTerm[]).map(extractScalarQueryTerm)
      return new BatchEncryptQueryOperation(this.client, internalTerms)
    }

    // Handle empty arrays: if opts provided, treat as single value; otherwise batch mode
    if (
      Array.isArray(plaintextOrTerms) &&
      plaintextOrTerms.length === 0 &&
      !opts
    ) {
      return new BatchEncryptQueryOperation(
        this.client,
        [] as readonly InternalScalarQueryTerm[],
      )
    }

    if (!opts) {
      throw new Error('EncryptQueryOptions are required')
    }

    const internal = extractQueryOptions(opts)
    return new EncryptQueryOperation(
      this.client,
      plaintextOrTerms as JsPlaintext,
      internal,
    )
  }

  /**
   * Decryption - returns a promise which resolves to a decrypted value.
   *
   * @param encryptedData - The encrypted data to be decrypted.
   * @returns A DecryptOperation that can be awaited or chained with additional methods.
   */
  decrypt(encryptedData: Encrypted): DecryptOperation {
    return new DecryptOperation(this.client, encryptedData)
  }

  /**
   * Encrypt a model (object) based on the contract table definition.
   *
   * Only fields whose keys match columns defined in the contract are encrypted.
   * All other fields are passed through unchanged.
   *
   * @param input - The model object with plaintext values to encrypt.
   * @param tableRef - The contract table reference defining which fields to encrypt.
   * @returns An `EncryptModelOperation` that can be awaited to get a `Result`.
   *
   * @example
   * ```typescript
   * const result = await client.encryptModel(
   *   { id: "user_123", email: "alice@example.com" },
   *   contract.users,
   * )
   * ```
   */
  encryptModel<
    T extends Record<string, unknown>,
    C extends TableColumns = TableColumns,
  >(
    input: T,
    tableRef: ContractTableRef<C>,
  ): EncryptModelOperation<EncryptedFromContract<T, C>> {
    return new EncryptModelOperation(
      this.client,
      input as Record<string, unknown>,
      tableRef._table,
    )
  }

  /**
   * Decrypt a model (object) whose fields contain encrypted values.
   */
  decryptModel<T extends Record<string, unknown>>(
    input: T,
  ): DecryptModelOperation<T> {
    return new DecryptModelOperation(this.client, input)
  }

  /**
   * Encrypt multiple models (objects) in a single bulk operation.
   *
   * @param input - An array of model objects with plaintext values to encrypt.
   * @param tableRef - The contract table reference defining which fields to encrypt.
   */
  bulkEncryptModels<
    T extends Record<string, unknown>,
    C extends TableColumns = TableColumns,
  >(
    input: Array<T>,
    tableRef: ContractTableRef<C>,
  ): BulkEncryptModelsOperation<EncryptedFromContract<T, C>> {
    return new BulkEncryptModelsOperation(
      this.client,
      input as Array<Record<string, unknown>>,
      tableRef._table,
    )
  }

  /**
   * Decrypt multiple models (objects) in a single bulk operation.
   */
  bulkDecryptModels<T extends Record<string, unknown>>(
    input: Array<T>,
  ): BulkDecryptModelsOperation<T> {
    return new BulkDecryptModelsOperation(this.client, input)
  }

  /**
   * Encrypt multiple plaintext values in a single bulk operation.
   *
   * @param plaintexts - An array of objects with `plaintext` (and optional `id`) fields.
   * @param opts - Options specifying the contract column reference. See {@link EncryptOptions}.
   */
  bulkEncrypt(
    plaintexts: BulkEncryptPayload,
    opts: EncryptOptions,
  ): BulkEncryptOperation {
    const internal = extractColumnRef(opts.contract)
    return new BulkEncryptOperation(this.client, plaintexts, internal)
  }

  /**
   * Decrypt multiple encrypted values in a single bulk operation.
   */
  bulkDecrypt(encryptedPayloads: BulkDecryptPayload): BulkDecryptOperation {
    return new BulkDecryptOperation(this.client, encryptedPayloads)
  }

  /** e.g., debugging or environment info */
  clientInfo() {
    return {
      workspaceId: this.workspaceId,
    }
  }
}

function isValidUuid(uuid: string): boolean {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  return uuidRegex.test(uuid)
}

/**
 * Creates and initializes an Encryption client using a contract definition.
 *
 * @param config - Initialization options. Must include `contract`; optionally include `config` for
 *   workspace/keys.
 * @returns A Promise that resolves to an initialized {@link EncryptionClient}.
 *
 * @example
 * ```typescript
 * import { Encryption, defineContract } from "@cipherstash/stack"
 *
 * const contract = defineContract({
 *   users: {
 *     email: { type: 'string', equality: true },
 *   },
 * })
 *
 * const client = await Encryption({ contract })
 * ```
 */
export const Encryption = async (
  config: EncryptionClientConfig,
): Promise<EncryptionClient> => {
  const { contract, config: clientConfig } = config

  const tables = getContractTables(contract)

  if (!tables.length) {
    throw new Error(
      '[encryption]: At least one table must be defined in the contract to initialize the encryption client',
    )
  }

  if (
    clientConfig?.keyset &&
    'id' in clientConfig.keyset &&
    !isValidUuid(clientConfig.keyset.id)
  ) {
    throw new Error(
      '[encryption]: Invalid UUID provided for keyset id. Must be a valid UUID.',
    )
  }

  const client = new EncryptionClient(clientConfig?.workspaceCrn)
  const encryptConfig = buildEncryptConfig(...tables)

  const result = await client.init({
    encryptConfig,
    ...clientConfig,
  })

  if (result.failure) {
    throw new Error(`[encryption]: ${result.failure.message}`)
  }

  return result.data
}
