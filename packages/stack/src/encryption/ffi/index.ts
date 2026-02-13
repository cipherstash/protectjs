import { type EncryptionError, EncryptionErrorTypes } from '@/errors'
import {
  type EncryptConfig,
  type ProtectTable,
  type ProtectTableColumn,
  encryptConfigSchema,
} from '@/schema'
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
} from '@/types'
import { loadWorkSpaceId } from '@/utils/config'
import { logger } from '@/utils/logger'
import { type Result, withResult } from '@byteslice/result'
import { type JsPlaintext, newClient } from '@cipherstash/protect-ffi'
import { toFfiKeysetIdentifier } from '../helpers'
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

export const noClientError = () =>
  new Error(
    'The EQL client has not been initialized. Please call init() before using the client.',
  )

/** The EncryptionClient is the main entry point for interacting with the CipherStash Protect.js library.
 * It provides methods for encrypting and decrypting individual values, as well as models (objects) and bulk operations.
 *
 * The client must be initialized using the {@link protect} function before it can be used.
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
   * @returns A promise that resolves to a {@link Result} containing the initialized EncryptionClient or a {@link ProtectError}.
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
   * The following example demonstrates how to encrypt a value using the Protect client.
   * It includes defining an encryption schema with {@link encryptedTable} and {@link encryptedColumn},
   * initializing the client with {@link protect}, and performing the encryption.
   *
   * `encrypt` returns an {@link EncryptOperation} which can be awaited to get a {@link Result}
   * which can either be the encrypted value or a {@link ProtectError}.
   *
   * ```typescript
   * // Define encryption schema
   * import { encryptedTable, encryptedColumn } from "@cipherstash/protect"
   * const userSchema = encryptedTable("users", {
   *  email: encryptedColumn("email"),
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
   * The following example demonstrates how to encrypt a query value using the Protect client.
   *
   * ```typescript
   * // Define encryption schema
   * import { encryptedTable, encryptedColumn } from "@cipherstash/protect"
   * const userSchema = encryptedTable("users", {
   *  email: encryptedColumn("email").equality(),
   * });
   *
   * // Initialize Protect client
   * const protectClient = await protect({ schemas: [userSchema] })
   *
   * // Encrypt a query value
   * const encryptedResult = await protectClient.encryptQuery(
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
   * const encryptedResult = await protectClient.encryptQuery(
   *  "person@example.com",
   *  { column: userSchema.email, table: userSchema }
   * )
   * ```
   *
   * @see {@link EncryptQueryOperation}
   *
   * **JSONB columns (searchableJson):**
   * When `queryType` is omitted on a `searchableJson()` column, the query operation is inferred:
   * - String plaintext → `steVecSelector` (JSONPath queries like `'$.user.email'`)
   * - Object/Array plaintext → `steVecTerm` (containment queries like `{ role: 'admin' }`)
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

    if (!opts) {
      throw new Error('EncryptQueryOptions are required')
    }

    return new EncryptQueryOperation(
      this.client,
      plaintextOrTerms as JsPlaintext | null,
      opts,
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
   * Encrypt a model (object) based on the table schema.
   *
   * Only fields whose keys match columns defined in the table schema are encrypted.
   * All other fields are passed through unchanged. Returns a thenable operation
   * that supports `.withLockContext()` for identity-aware encryption.
   *
   * @param input - The model object with plaintext values to encrypt.
   * @param table - The table schema defining which fields to encrypt.
   * @returns An `EncryptModelOperation<T>` that can be awaited to get a `Result`
   *   containing the model with encrypted fields, or an `EncryptionError`.
   *
   * @example
   * ```typescript
   * import { Encryption } from "@cipherstash/stack"
   * import { encryptedTable, encryptedColumn } from "@cipherstash/stack/schema"
   *
   * type User = { id: string; email: string; createdAt: Date }
   *
   * const usersSchema = encryptedTable("users", {
   *   email: encryptedColumn("email").equality(),
   * })
   *
   * const client = await Encryption({ schemas: [usersSchema] })
   *
   * const result = await client.encryptModel<User>(
   *   { id: "user_123", email: "alice@example.com", createdAt: new Date() },
   *   usersSchema,
   * )
   *
   * if (result.failure) {
   *   console.error(result.failure.message)
   * } else {
   *   // result.data.id is unchanged, result.data.email is encrypted
   *   console.log(result.data)
   * }
   * ```
   */
  encryptModel<T extends Record<string, unknown>>(
    input: Decrypted<T>,
    table: ProtectTable<ProtectTableColumn>,
  ): EncryptModelOperation<T> {
    return new EncryptModelOperation(this.client, input, table)
  }

  /**
   * Decrypt a model (object) whose fields contain encrypted values.
   *
   * Identifies encrypted fields automatically and decrypts them, returning the
   * model with plaintext values. Returns a thenable operation that supports
   * `.withLockContext()` for identity-aware decryption.
   *
   * @param input - The model object with encrypted field values.
   * @returns A `DecryptModelOperation<T>` that can be awaited to get a `Result`
   *   containing the model with decrypted plaintext fields, or an `EncryptionError`.
   *
   * @example
   * ```typescript
   * // Decrypt a previously encrypted model
   * const decrypted = await client.decryptModel<User>(encryptedUser)
   *
   * if (decrypted.failure) {
   *   console.error(decrypted.failure.message)
   * } else {
   *   console.log(decrypted.data.email) // "alice@example.com"
   * }
   *
   * // With a lock context
   * const decrypted = await client
   *   .decryptModel<User>(encryptedUser)
   *   .withLockContext(lockContext)
   * ```
   */
  decryptModel<T extends Record<string, unknown>>(
    input: T,
  ): DecryptModelOperation<T> {
    return new DecryptModelOperation(this.client, input)
  }

  /**
   * Encrypt multiple models (objects) in a single bulk operation.
   *
   * Performs a single call to ZeroKMS regardless of the number of models,
   * while still using a unique key for each encrypted value. Only fields
   * matching the table schema are encrypted; other fields pass through unchanged.
   *
   * @param input - An array of model objects with plaintext values to encrypt.
   * @param table - The table schema defining which fields to encrypt.
   * @returns A `BulkEncryptModelsOperation<T>` that can be awaited to get a `Result`
   *   containing an array of models with encrypted fields, or an `EncryptionError`.
   *
   * @example
   * ```typescript
   * import { Encryption } from "@cipherstash/stack"
   * import { encryptedTable, encryptedColumn } from "@cipherstash/stack/schema"
   *
   * type User = { id: string; email: string }
   *
   * const usersSchema = encryptedTable("users", {
   *   email: encryptedColumn("email"),
   * })
   *
   * const client = await Encryption({ schemas: [usersSchema] })
   *
   * const result = await client.bulkEncryptModels<User>(
   *   [
   *     { id: "1", email: "alice@example.com" },
   *     { id: "2", email: "bob@example.com" },
   *   ],
   *   usersSchema,
   * )
   *
   * if (!result.failure) {
   *   console.log(result.data) // array of models with encrypted email fields
   * }
   * ```
   */
  bulkEncryptModels<T extends Record<string, unknown>>(
    input: Array<Decrypted<T>>,
    table: ProtectTable<ProtectTableColumn>,
  ): BulkEncryptModelsOperation<T> {
    return new BulkEncryptModelsOperation(this.client, input, table)
  }

  /**
   * Decrypt multiple models (objects) in a single bulk operation.
   *
   * Performs a single call to ZeroKMS regardless of the number of models,
   * restoring all encrypted fields to their original plaintext values.
   *
   * @param input - An array of model objects with encrypted field values.
   * @returns A `BulkDecryptModelsOperation<T>` that can be awaited to get a `Result`
   *   containing an array of models with decrypted plaintext fields, or an `EncryptionError`.
   *
   * @example
   * ```typescript
   * const encryptedUsers = encryptedResult.data // from bulkEncryptModels
   *
   * const result = await client.bulkDecryptModels<User>(encryptedUsers)
   *
   * if (!result.failure) {
   *   for (const user of result.data) {
   *     console.log(user.email) // plaintext email
   *   }
   * }
   *
   * // With a lock context
   * const result = await client
   *   .bulkDecryptModels<User>(encryptedUsers)
   *   .withLockContext(lockContext)
   * ```
   */
  bulkDecryptModels<T extends Record<string, unknown>>(
    input: Array<T>,
  ): BulkDecryptModelsOperation<T> {
    return new BulkDecryptModelsOperation(this.client, input)
  }

  /**
   * Encrypt multiple plaintext values in a single bulk operation.
   *
   * Each value is encrypted with its own unique key via a single call to ZeroKMS.
   * Values can include optional `id` fields for correlating results back to
   * your application data. Null plaintext values are preserved as null.
   *
   * @param plaintexts - An array of objects with `plaintext` (and optional `id`) fields.
   * @param opts - Options specifying the target column and table for encryption.
   * @returns A `BulkEncryptOperation` that can be awaited to get a `Result`
   *   containing an array of `{ id?, data: Encrypted }` objects, or an `EncryptionError`.
   *
   * @example
   * ```typescript
   * import { Encryption } from "@cipherstash/stack"
   * import { encryptedTable, encryptedColumn } from "@cipherstash/stack/schema"
   *
   * const users = encryptedTable("users", {
   *   email: encryptedColumn("email"),
   * })
   * const client = await Encryption({ schemas: [users] })
   *
   * const result = await client.bulkEncrypt(
   *   [
   *     { id: "u1", plaintext: "alice@example.com" },
   *     { id: "u2", plaintext: "bob@example.com" },
   *     { id: "u3", plaintext: null },
   *   ],
   *   { column: users.email, table: users },
   * )
   *
   * if (!result.failure) {
   *   // result.data = [{ id: "u1", data: Encrypted }, { id: "u2", data: Encrypted }, ...]
   *   console.log(result.data)
   * }
   * ```
   */
  bulkEncrypt(
    plaintexts: BulkEncryptPayload,
    opts: EncryptOptions,
  ): BulkEncryptOperation {
    return new BulkEncryptOperation(this.client, plaintexts, opts)
  }

  /**
   * Decrypt multiple encrypted values in a single bulk operation.
   *
   * Performs a single call to ZeroKMS to decrypt all values. The result uses
   * a multi-status pattern: each item in the returned array has either a `data`
   * field (success) or an `error` field (failure), allowing graceful handling
   * of partial failures.
   *
   * @param encryptedPayloads - An array of objects with `data` (encrypted payload) and optional `id` fields.
   * @returns A `BulkDecryptOperation` that can be awaited to get a `Result`
   *   containing an array of `{ id?, data: plaintext }` or `{ id?, error: string }` objects,
   *   or an `EncryptionError` if the entire operation fails.
   *
   * @example
   * ```typescript
   * const encrypted = await client.bulkEncrypt(plaintexts, { column: users.email, table: users })
   *
   * const result = await client.bulkDecrypt(encrypted.data)
   *
   * if (!result.failure) {
   *   for (const item of result.data) {
   *     if ("data" in item) {
   *       console.log(`${item.id}: ${item.data}`)
   *     } else {
   *       console.error(`${item.id} failed: ${item.error}`)
   *     }
   *   }
   * }
   * ```
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
