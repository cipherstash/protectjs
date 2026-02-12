import { type Result, withResult } from '@byteslice/result'
import { type JsPlaintext, newClient } from '@cipherstash/protect-ffi'
import {
  type EncryptConfig,
  type EncryptedTable,
  type EncryptedTableColumn,
  encryptConfigSchema,
} from '@cipherstash/schema'
import { type EncryptionError, EncryptionErrorTypes } from '..'
import { loadWorkSpaceId } from '../../../utils/config'
import { logger } from '../../../utils/logger'
import { toFfiKeysetIdentifier } from '../helpers'
import type {
  BulkDecryptPayload,
  BulkEncryptPayload,
  Client,
  Decrypted,
  EncryptOptions,
  EncryptQueryOptions,
  Encrypted,
  KeysetIdentifier,
  ScalarQueryTerm,
  SearchTerm,
} from '../types'
import { isScalarQueryTermArray } from './helpers/type-guards'
import { BatchEncryptQueryOperation } from './operations/batch-encrypt-query'
import { BulkDecryptOperation } from './operations/bulk-decrypt'
import { BulkDecryptModelsOperation } from './operations/bulk-decrypt-models'
import { BulkEncryptOperation } from './operations/bulk-encrypt'
import { BulkEncryptModelsOperation } from './operations/bulk-encrypt-models'
import { DecryptOperation } from './operations/decrypt'
import { DecryptModelOperation } from './operations/decrypt-model'
import { SearchTermsOperation } from './operations/deprecated/search-terms'
import { EncryptOperation } from './operations/encrypt'
import { EncryptModelOperation } from './operations/encrypt-model'
import { EncryptQueryOperation } from './operations/encrypt-query'

export const noClientError = () =>
  new Error(
    'The Encryption client has not been initialized. Please call init() before using the client.',
  )

/** The EncryptionClient is the main entry point for interacting with the CipherStash encryption library.
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
   * @returns A promise that resolves to a {@link Result} containing the initialized EncryptionClient or a {@link EncryptionError}.
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
          'Initializing the Encryption client with the following encrypt config:',
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

        logger.info('Successfully initialized the Encryption client.')
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
   * @param plaintext - The plaintext value to be encrypted. Can be null.
   * @param opts - Options specifying the column and table for encryption.
   * @returns An EncryptOperation that can be awaited or chained with additional methods.
   *
   * @example
   * The following example demonstrates how to encrypt a value using the Encryption client.
   * It includes defining an encryption schema with {@link encryptedTable} and {@link encryptedColumn},
   * initializing the client with {@link Encryption}, and performing the encryption.
   *
   * `encrypt` returns an {@link EncryptOperation} which can be awaited to get a {@link Result}
   * which can either be the encrypted value or a {@link EncryptionError}.
   *
   * ```typescript
   * // Define encryption schema
   * import { encryptedTable, encryptedColumn } from "@cipherstash/stack"
   * const userSchema = encryptedTable("users", {
   *  email: encryptedColumn("email"),
   * });
   *
   * // Initialize Encryption client
   * const encryptionClient = await Encryption({ schemas: [userSchema] })
   *
   * // Encrypt a value
   * const encryptedResult = await encryptionClient.encrypt(
   *  "person@example.com",
   *  { column: userSchema.email, table: userSchema }
   * )
   *
   * // Handle encryption result
   * if (encryptedResult.failure) {
   *   throw new Error(`Encryption failed: ${encryptedResult.failure.message}`);
   * }
   *
   * console.log("Encrypted data:", encryptedResult.data);
   * ```
   *
   * @example
   * When encrypting data, a {@link LockContext} can be provided to tie the encryption to a specific user or session.
   * This ensures that the same lock context is required for decryption.
   *
   * The following example demonstrates how to create a lock context using a user's JWT token
   * and use it during encryption.
   *
   * ```typescript
   * // Define encryption schema and initialize client as above
   *
   * // Create a lock for the user's `sub` claim from their JWT
   * const lc = new LockContext();
   * const lockContext = await lc.identify(userJwt);
   *
   * if (lockContext.failure) {
   *   // Handle the failure
   * }
   *
   * // Encrypt a value with the lock context
   * // Decryption will then require the same lock context
   * const encryptedResult = await encryptionClient.encrypt(
   *  "person@example.com",
   *  { column: userSchema.email, table: userSchema }
   * )
   *  .withLockContext(lockContext)
   * ```
   *
   * @see {@link Result}
   * @see {@link encryptedTable}
   * @see {@link LockContext}
   * @see {@link EncryptOperation}
   */
  encrypt(
    plaintext: JsPlaintext | null,
    opts: EncryptOptions,
  ): EncryptOperation {
    return new EncryptOperation(this.client, plaintext, opts)
  }

  /**
   * Encrypt a query value - returns a promise which resolves to an encrypted query value.
   *
   * @param plaintext - The plaintext value to be encrypted for querying. Can be null.
   * @param opts - Options specifying the column, table, and optional queryType for encryption.
   * @returns An EncryptQueryOperation that can be awaited or chained with additional methods.
   *
   * @example
   * The following example demonstrates how to encrypt a query value using the Encryption client.
   *
   * ```typescript
   * // Define encryption schema
   * import { encryptedTable, encryptedColumn } from "@cipherstash/stack"
   * const userSchema = encryptedTable("users", {
   *  email: encryptedColumn("email").equality(),
   * });
   *
   * // Initialize Encryption client
   * const encryptionClient = await Encryption({ schemas: [userSchema] })
   *
   * // Encrypt a query value
   * const encryptedResult = await encryptionClient.encryptQuery(
   *  "person@example.com",
   *  { column: userSchema.email, table: userSchema, queryType: 'equality' }
   * )
   *
   * // Handle encryption result
   * if (encryptedResult.failure) {
   *   throw new Error(`Encryption failed: ${encryptedResult.failure.message}`);
   * }
   *
   * console.log("Encrypted query:", encryptedResult.data);
   * ```
   *
   * @example
   * The queryType can be auto-inferred from the column's configured indexes:
   *
   * ```typescript
   * // When queryType is omitted, it will be inferred from the column's indexes
   * const encryptedResult = await encryptionClient.encryptQuery(
   *  "person@example.com",
   *  { column: userSchema.email, table: userSchema }
   * )
   * ```
   *
   * @see {@link EncryptQueryOperation}
   */
  encryptQuery(
    plaintext: JsPlaintext | null,
    opts: EncryptQueryOptions,
  ): EncryptQueryOperation

  /**
   * Encrypt multiple values for use in queries (batch operation).
   * @param terms - Array of query terms to encrypt
   */
  encryptQuery(terms: readonly ScalarQueryTerm[]): BatchEncryptQueryOperation

  encryptQuery(
    plaintextOrTerms: JsPlaintext | null | readonly ScalarQueryTerm[],
    opts?: EncryptQueryOptions,
  ): EncryptQueryOperation | BatchEncryptQueryOperation {
    // Discriminate between ScalarQueryTerm[] and JsPlaintext (which can also be an array)
    // using a type guard function
    if (isScalarQueryTermArray(plaintextOrTerms)) {
      return new BatchEncryptQueryOperation(this.client, plaintextOrTerms)
    }

    // Handle empty arrays: if opts provided, treat as single value; otherwise batch mode
    // This maintains backward compatibility for encryptQuery([]) while allowing
    // encryptQuery([], opts) to encrypt an empty array as a single value
    if (
      Array.isArray(plaintextOrTerms) &&
      plaintextOrTerms.length === 0 &&
      !opts
    ) {
      return new BatchEncryptQueryOperation(
        this.client,
        [] as readonly ScalarQueryTerm[],
      )
    }

    return new EncryptQueryOperation(
      this.client,
      plaintextOrTerms as JsPlaintext | null,
      opts!,
    )
  }

  /**
   * Decryption - returns a promise which resolves to a decrypted value.
   *
   * @param encryptedData - The encrypted data to be decrypted.
   * @returns A DecryptOperation that can be awaited or chained with additional methods.
   *
   * @example
   * The following example demonstrates how to decrypt a value that was previously encrypted using {@link encrypt} client.
   * It includes encrypting a value first, then decrypting it, and handling the result.
   *
   * ```typescript
   * const encryptedData = await encryptionClient.encrypt(
   *  "person@example.com",
   *  { column: "email", table: "users" }
   * )
   * const decryptResult = await encryptionClient.decrypt(encryptedData)
   * if (decryptResult.failure) {
   *   throw new Error(`Decryption failed: ${decryptResult.failure.message}`);
   * }
   * console.log("Decrypted data:", decryptResult.data);
   * ```
   *
   * @example
   * Provide a lock context when decrypting:
   * ```typescript
   *    await encryptionClient.decrypt(encryptedData)
   *      .withLockContext(lockContext)
   * ```
   *
   * @see {@link LockContext}
   * @see {@link DecryptOperation}
   */
  decrypt(encryptedData: Encrypted): DecryptOperation {
    return new DecryptOperation(this.client, encryptedData)
  }

  /**
   * Encrypt a model based on its encryptConfig.
   *
   * @example
   * ```typescript
   * type User = {
   *   id: string;
   *   email: string; // encrypted
   * }
   *
   * // Define the schema for the users table
   * const usersSchema = encryptedTable('users', {
   *   email: encryptedColumn('email').freeTextSearch().equality().orderAndRange(),
   * })
   *
   * // Initialize the Encryption client
   * const encryptionClient = await Encryption({ schemas: [usersSchema] })
   *
   * // Encrypt a user model
   * const encryptedModel = await encryptionClient.encryptModel<User>(
   *   { id: 'user_123', email: 'person@example.com' },
   *   usersSchema,
   * )
   * ```
   */
  encryptModel<T extends Record<string, unknown>>(
    input: Decrypted<T>,
    table: EncryptedTable<EncryptedTableColumn>,
  ): EncryptModelOperation<T> {
    return new EncryptModelOperation(this.client, input, table)
  }

  /**
   * Decrypt a model with encrypted values
   * Usage:
   *    await encryptionClient.decryptModel(encryptedModel)
   *    await encryptionClient.decryptModel(encryptedModel).withLockContext(lockContext)
   */
  decryptModel<T extends Record<string, unknown>>(
    input: T,
  ): DecryptModelOperation<T> {
    return new DecryptModelOperation(this.client, input)
  }

  /**
   * Bulk encrypt models with decrypted values
   * Usage:
   *    await encryptionClient.bulkEncryptModels(decryptedModels, table)
   *    await encryptionClient.bulkEncryptModels(decryptedModels, table).withLockContext(lockContext)
   */
  bulkEncryptModels<T extends Record<string, unknown>>(
    input: Array<Decrypted<T>>,
    table: EncryptedTable<EncryptedTableColumn>,
  ): BulkEncryptModelsOperation<T> {
    return new BulkEncryptModelsOperation(this.client, input, table)
  }

  /**
   * Bulk decrypt models with encrypted values
   * Usage:
   *    await encryptionClient.bulkDecryptModels(encryptedModels)
   *    await encryptionClient.bulkDecryptModels(encryptedModels).withLockContext(lockContext)
   */
  bulkDecryptModels<T extends Record<string, unknown>>(
    input: Array<T>,
  ): BulkDecryptModelsOperation<T> {
    return new BulkDecryptModelsOperation(this.client, input)
  }

  /**
   * Bulk encryption - returns a thenable object.
   * Usage:
   *    await encryptionClient.bulkEncrypt(plaintexts, { column, table })
   *    await encryptionClient.bulkEncrypt(plaintexts, { column, table }).withLockContext(lockContext)
   */
  bulkEncrypt(
    plaintexts: BulkEncryptPayload,
    opts: EncryptOptions,
  ): BulkEncryptOperation {
    return new BulkEncryptOperation(this.client, plaintexts, opts)
  }

  /**
   * Bulk decryption - returns a thenable object.
   * Usage:
   *    await encryptionClient.bulkDecrypt(encryptedPayloads)
   *    await encryptionClient.bulkDecrypt(encryptedPayloads).withLockContext(lockContext)
   */
  bulkDecrypt(encryptedPayloads: BulkDecryptPayload): BulkDecryptOperation {
    return new BulkDecryptOperation(this.client, encryptedPayloads)
  }

  /**
   * Create search terms to use in a query searching encrypted data
   *
   * @deprecated Use `encryptQuery(terms)` instead.
   *
   * Migration example:
   * ```typescript
   * // Before (deprecated)
   * const result = await client.createSearchTerms([
   *   { value: 'test', column: users.email, table: users }
   * ])
   *
   * // After
   * const result = await client.encryptQuery([
   *   { value: 'test', column: users.email, table: users, queryType: 'equality' }
   * ])
   * ```
   *
   * Usage:
   *    await encryptionClient.createSearchTerms(searchTerms)
   *    await encryptionClient.createSearchTerms(searchTerms).withLockContext(lockContext)
   */
  createSearchTerms(terms: SearchTerm[]): SearchTermsOperation {
    return new SearchTermsOperation(this.client, terms)
  }

  /** e.g., debugging or environment info */
  clientInfo() {
    return {
      workspaceId: this.workspaceId,
    }
  }
}

/** @deprecated Use EncryptionClient */
export { EncryptionClient as ProtectClient }
