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
  EncryptQueryOptions,
  Encrypted,
  KeysetIdentifier,
  QuerySearchTerm,
  QueryTerm,
  SearchTerm,
} from '../types'
import { isQueryTermArray } from '../query-term-guards'
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
import { QuerySearchTermsOperation } from './operations/query-search-terms'
import { SearchTermsOperation } from './operations/search-terms'

export const noClientError = () =>
  new Error(
    'The EQL client has not been initialized. Please call init() before using the client.',
  )

/** The ProtectClient is the main entry point for interacting with the CipherStash Protect.js library.
 * It provides methods for encrypting and decrypting individual values, as well as models (objects) and bulk operations.
 *
 * The client must be initialized using the {@link protect} function before it can be used.
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
   * Initializes the ProtectClient with the provided configuration.
   * @internal
   * @param config - The configuration object for initializing the client.
   * @returns A promise that resolves to a {@link Result} containing the initialized ProtectClient or a {@link ProtectError}.
   **/
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
   * Encrypt a value - returns a promise which resolves to an encrypted value.
   *
   * @param plaintext - The plaintext value to be encrypted. Can be null.
   * @param opts - Options specifying the column and table for encryption.
   * @returns An EncryptOperation that can be awaited or chained with additional methods.
   *
   * @example
   * The following example demonstrates how to encrypt a value using the Protect client.
   * It includes defining an encryption schema with {@link csTable} and {@link csColumn},
   * initializing the client with {@link protect}, and performing the encryption.
   *
   * `encrypt` returns an {@link EncryptOperation} which can be awaited to get a {@link Result}
   * which can either be the encrypted value or a {@link ProtectError}.
   *
   * ```typescript
   * // Define encryption schema
   * import { csTable, csColumn } from "@cipherstash/protect"
   * const userSchema = csTable("users", {
   *  email: csColumn("email"),
   * });
   *
   * // Initialize Protect client
   * const protectClient = await protect({ schemas: [userSchema] })
   *
   * // Encrypt a value
   * const encryptedResult = await protectClient.encrypt(
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
   * const encryptedResult = await protectClient.encrypt(
   *  "person@example.com",
   *  { column: userSchema.email, table: userSchema }
   * )
   *  .withLockContext(lockContext)
   * ```
   *
   * @see {@link Result}
   * @see {@link csTable}
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
   * const encryptedData = await eqlClient.encrypt(
   *  "person@example.com",
   *  { column: "email", table: "users" }
   * )
   * const decryptResult = await eqlClient.decrypt(encryptedData)
   * if (decryptResult.failure) {
   *   throw new Error(`Decryption failed: ${decryptResult.failure.message}`);
   * }
   * console.log("Decrypted data:", decryptResult.data);
   * ```
   *
   * @example
   * Provide a lock context when decrypting:
   * ```typescript
   *    await eqlClient.decrypt(encryptedData)
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
   * const usersSchema = csTable('users', {
   *   email: csColumn('email').freeTextSearch().equality().orderAndRange(),
   * })
   *
   * // Initialize the Protect client
   * const protectClient = await protect({ schemas: [usersSchema] })
   *
   * // Encrypt a user model
   * const encryptedModel = await protectClient.encryptModel<User>(
   *   { id: 'user_123', email: 'person@example.com' },
   *   usersSchema,
   * )
   * ```
   */
  encryptModel<T extends Record<string, unknown>>(
    input: Decrypted<T>,
    table: ProtectTable<ProtectTableColumn>,
  ): EncryptModelOperation<T> {
    return new EncryptModelOperation(this.client, input, table)
  }

  /**
   * Decrypt a model with encrypted values
   * Usage:
   *    await eqlClient.decryptModel(encryptedModel)
   *    await eqlClient.decryptModel(encryptedModel).withLockContext(lockContext)
   */
  decryptModel<T extends Record<string, unknown>>(
    input: T,
  ): DecryptModelOperation<T> {
    return new DecryptModelOperation(this.client, input)
  }

  /**
   * Bulk encrypt models with decrypted values
   * Usage:
   *    await eqlClient.bulkEncryptModels(decryptedModels, table)
   *    await eqlClient.bulkEncryptModels(decryptedModels, table).withLockContext(lockContext)
   */
  bulkEncryptModels<T extends Record<string, unknown>>(
    input: Array<Decrypted<T>>,
    table: ProtectTable<ProtectTableColumn>,
  ): BulkEncryptModelsOperation<T> {
    return new BulkEncryptModelsOperation(this.client, input, table)
  }

  /**
   * Bulk decrypt models with encrypted values
   * Usage:
   *    await eqlClient.bulkDecryptModels(encryptedModels)
   *    await eqlClient.bulkDecryptModels(encryptedModels).withLockContext(lockContext)
   */
  bulkDecryptModels<T extends Record<string, unknown>>(
    input: Array<T>,
  ): BulkDecryptModelsOperation<T> {
    return new BulkDecryptModelsOperation(this.client, input)
  }

  /**
   * Bulk encryption - returns a thenable object.
   * Usage:
   *    await eqlClient.bulkEncrypt(plaintexts, { column, table })
   *    await eqlClient.bulkEncrypt(plaintexts, { column, table }).withLockContext(lockContext)
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
   *    await eqlClient.bulkDecrypt(encryptedPayloads)
   *    await eqlClient.bulkDecrypt(encryptedPayloads).withLockContext(lockContext)
   */
  bulkDecrypt(encryptedPayloads: BulkDecryptPayload): BulkDecryptOperation {
    return new BulkDecryptOperation(this.client, encryptedPayloads)
  }

  /**
   * @deprecated Use `encryptQuery(terms)` instead with QueryTerm types. Will be removed in v2.0.
   *
   * Create search terms to use in a query searching encrypted data
   * Usage:
   *    await eqlClient.createSearchTerms(searchTerms)
   *    await eqlClient.createSearchTerms(searchTerms).withLockContext(lockContext)
   */
  createSearchTerms(terms: SearchTerm[]): SearchTermsOperation {
    return new SearchTermsOperation(this.client, terms)
  }

  /**
   * Encrypt a single value for query operations with explicit index type control.
   *
   * This method produces SEM-only payloads optimized for database queries,
   * allowing you to specify which index type to use.
   *
   * @param plaintext - The value to encrypt for querying
   * @param opts - Options specifying the column, table, index type, and optional query operation
   * @returns An EncryptQueryOperation that can be awaited or chained with withLockContext
   *
   * @example
   * ```typescript
   * // Encrypt for ORE range query
   * const term = await protectClient.encryptQuery(100, {
   *   column: usersSchema.score,
   *   table: usersSchema,
   *   indexType: 'ore',
   * })
   * ```
   *
   * @see {@link https://cipherstash.com/docs/platform/searchable-encryption/supported-queries | Supported Query Types}
   */
  encryptQuery(
    plaintext: JsPlaintext | null,
    opts: EncryptQueryOptions,
  ): EncryptQueryOperation

  /**
   * Encrypt multiple query terms in batch with explicit control over each term.
   *
   * Supports scalar terms (with explicit indexType), JSON path queries, and JSON containment queries.
   * JSON queries implicitly use ste_vec index type.
   *
   * @param terms - Array of query terms to encrypt
   * @returns A BatchEncryptQueryOperation that can be awaited or chained with withLockContext
   *
   * @example
   * ```typescript
   * const terms = await protectClient.encryptQuery([
   *   // Scalar term with explicit index
   *   { value: 'admin@example.com', column: users.email, table: users, indexType: 'unique' },
   *   // JSON path query (ste_vec implicit)
   *   { path: 'user.email', value: 'test@example.com', column: jsonSchema.metadata, table: jsonSchema },
   *   // JSON containment query (ste_vec implicit)
   *   { contains: { role: 'admin' }, column: jsonSchema.metadata, table: jsonSchema },
   * ])
   * ```
   *
   * @remarks
   * Note: Empty arrays `[]` are treated as scalar plaintext values for backward
   * compatibility with the single-value overload. Pass a non-empty array to use
   * batch encryption.
   */
  encryptQuery(terms: readonly QueryTerm[]): BatchEncryptQueryOperation

  // Implementation
  encryptQuery(
    plaintextOrTerms: JsPlaintext | null | readonly QueryTerm[],
    opts?: EncryptQueryOptions,
  ): EncryptQueryOperation | BatchEncryptQueryOperation {
    // Check if this is a QueryTerm array by looking for QueryTerm-specific properties
    // This is needed because JsPlaintext includes JsPlaintext[] which overlaps with QueryTerm[]
    // Empty arrays are explicitly handled as batch operations (return empty result)
    if (Array.isArray(plaintextOrTerms)) {
      if (plaintextOrTerms.length === 0 || isQueryTermArray(plaintextOrTerms)) {
        return new BatchEncryptQueryOperation(
          this.client,
          plaintextOrTerms as unknown as readonly QueryTerm[],
        )
      }
    }
    // Non-array values pass through to single-value encryption
    if (!opts) {
      throw new Error(
        'encryptQuery requires options when called with a single value',
      )
    }
    return new EncryptQueryOperation(
      this.client,
      plaintextOrTerms as JsPlaintext | null,
      opts,
    )
  }

  /**
   * @deprecated Use `encryptQuery(terms)` instead. Will be removed in v2.0.
   *
   * Create multiple encrypted query terms with explicit index type control.
   *
   * This method produces SEM-only payloads optimized for database queries,
   * providing explicit control over which index type and query operation to use for each term.
   *
   * @param terms - Array of query search terms with index type specifications
   * @returns A QuerySearchTermsOperation that can be awaited or chained with withLockContext
   *
   * @example
   * ```typescript
   * const terms = await protectClient.createQuerySearchTerms([
   *   {
   *     value: 'admin@example.com',
   *     column: usersSchema.email,
   *     table: usersSchema,
   *     indexType: 'unique',
   *   },
   *   {
   *     value: 100,
   *     column: usersSchema.score,
   *     table: usersSchema,
   *     indexType: 'ore',
   *   },
   * ])
   *
   * // Use in PostgreSQL query
   * const result = await db.query(
   *   `SELECT * FROM users
   *    WHERE cs_unique_v1(email) = $1
   *    AND cs_ore_64_8_v1(score) > $2`,
   *   [terms.data[0], terms.data[1]]
   * )
   * ```
   *
   * @see {@link https://cipherstash.com/docs/platform/searchable-encryption/supported-queries | Supported Query Types}
   */
  createQuerySearchTerms(terms: QuerySearchTerm[]): QuerySearchTermsOperation {
    return new QuerySearchTermsOperation(this.client, terms)
  }

  /** e.g., debugging or environment info */
  clientInfo() {
    return {
      workspaceId: this.workspaceId,
    }
  }
}
