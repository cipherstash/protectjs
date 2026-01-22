import type { ProtectTable, ProtectTableColumn } from '@cipherstash/schema'
import { buildEncryptConfig } from '@cipherstash/schema'
import { ProtectClient } from './ffi'
import type { KeysetIdentifier } from './types'

export const ProtectErrorTypes = {
  ClientInitError: 'ClientInitError',
  EncryptionError: 'EncryptionError',
  DecryptionError: 'DecryptionError',
  LockContextError: 'LockContextError',
  CtsTokenError: 'CtsTokenError',
}

/**
 * Error object returned by Protect.js operations.
 */
export interface ProtectError {
  /** The machine-readable error type. */
  type: (typeof ProtectErrorTypes)[keyof typeof ProtectErrorTypes]
  /** A human-readable description of the error. */
  message: string
}

type AtLeastOneCsTable<T> = [T, ...T[]]

/**
 * Configuration for initializing the Protect client.
 *
 * Credentials can be provided directly here, or via environment variables/configuration files.
 * Environment variables take precedence.
 *
 * @see {@link protect} for full configuration details.
 */
export type ProtectClientConfig = {
  /** One or more table definitions created with `csTable`. At least one is required. */
  schemas: AtLeastOneCsTable<ProtectTable<ProtectTableColumn>>
  /** The workspace CRN for your CipherStash account. Maps to `CS_WORKSPACE_CRN`. */
  workspaceCrn?: string
  /** The access key for your account. Maps to `CS_CLIENT_ACCESS_KEY`. Should be kept secret. */
  accessKey?: string
  /** The client ID for your project. Maps to `CS_CLIENT_ID`. */
  clientId?: string
  /** The client key for your project. Maps to `CS_CLIENT_KEY`. Should be kept secret. */
  clientKey?: string
  /** Optional identifier for the keyset to use. */
  keyset?: KeysetIdentifier
}

function isValidUuid(uuid: string): boolean {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  return uuidRegex.test(uuid)
}

/**
 * Initialize the CipherStash Protect client.
 *
 * The client can be configured in three ways (in order of precedence):
 * 1. **Environment Variables**:
 *    - `CS_CLIENT_ID`: Your client ID.
 *    - `CS_CLIENT_KEY`: Your client key (secret).
 *    - `CS_WORKSPACE_CRN`: Your workspace CRN.
 *    - `CS_CLIENT_ACCESS_KEY`: Your access key (secret).
 *    - `CS_CONFIG_PATH`: Path for temporary configuration storage (default: `~/.cipherstash`).
 * 2. **Configuration Files** (`cipherstash.toml` and `cipherstash.secret.toml` in project root).
 * 3. **Direct Configuration**: Passing a {@link ProtectClientConfig} object.
 *
 * @param config - The configuration object.
 * @returns A Promise that resolves to an initialized {@link ProtectClient}.
 *
 * @example
 * **Basic Initialization**
 * ```typescript
 * import { protect } from "@cipherstash/protect";
 * import { users } from "./schema";
 *
 * const protectClient = await protect({ schemas: [users] });
 * ```
 *
 * @example
 * **Production Deployment (Serverless)**
 * In environments like Vercel or AWS Lambda, ensure the user has write permissions:
 * ```bash
 * export CS_CONFIG_PATH="/tmp/.cipherstash"
 * ```
 *
 * @throws Will throw if no schemas are provided or if credentials are missing.
 */
export const protect = async (
  config: ProtectClientConfig,
): Promise<ProtectClient> => {
  const { schemas } = config

  if (!schemas.length) {
    throw new Error(
      '[protect]: At least one csTable must be provided to initialize the protect client',
    )
  }

  if (
    config.keyset &&
    'id' in config.keyset &&
    !isValidUuid(config.keyset.id)
  ) {
    throw new Error(
      '[protect]: Invalid UUID provided for keyset id. Must be a valid UUID.',
    )
  }

  const clientConfig = {
    workspaceCrn: config.workspaceCrn,
    accessKey: config.accessKey,
    clientId: config.clientId,
    clientKey: config.clientKey,
    keyset: config.keyset,
  }

  const client = new ProtectClient(clientConfig.workspaceCrn)
  const encryptConfig = buildEncryptConfig(...schemas)

  const result = await client.init({
    encryptConfig,
    ...clientConfig,
  })

  if (result.failure) {
    throw new Error(`[protect]: ${result.failure.message}`)
  }

  return result.data
}

export type { Result } from '@byteslice/result'
export type { ProtectClient } from './ffi'
export type { ProtectOperation } from './ffi/operations/base-operation'
export type { BulkEncryptOperation } from './ffi/operations/bulk-encrypt'
export type { BulkDecryptOperation } from './ffi/operations/bulk-decrypt'
export type { BulkEncryptModelsOperation } from './ffi/operations/bulk-encrypt-models'
export type { BulkDecryptModelsOperation } from './ffi/operations/bulk-decrypt-models'
export type { DecryptOperation } from './ffi/operations/decrypt'
export type { DecryptModelOperation } from './ffi/operations/decrypt-model'
export type { EncryptModelOperation } from './ffi/operations/encrypt-model'
export type { EncryptOperation } from './ffi/operations/encrypt'
export type { SearchTermsOperation } from './ffi/operations/search-terms'
export type { EncryptQueryOperation } from './ffi/operations/encrypt-query'
export type { QuerySearchTermsOperation } from './ffi/operations/query-search-terms'
export type { BatchEncryptQueryOperation } from './ffi/operations/batch-encrypt-query'

export { csTable, csColumn, csValue } from '@cipherstash/schema'
export type {
  ProtectColumn,
  ProtectTable,
  ProtectTableColumn,
  ProtectValue,
} from '@cipherstash/schema'
export type {
  LockContext,
  CtsRegions,
  IdentifyOptions,
  CtsToken,
  Context,
  LockContextOptions,
  GetLockContextResponse,
} from './identify'
export * from './helpers'

// Explicitly export only the public types (not internal query types)
export type {
  Client,
  Encrypted,
  EncryptedPayload,
  EncryptedData,
  SearchTerm,
  SimpleSearchTerm,
  KeysetIdentifier,
  EncryptedSearchTerm,
  EncryptPayload,
  EncryptOptions,
  EncryptQueryOptions,
  EncryptedFields,
  OtherFields,
  DecryptedFields,
  Decrypted,
  BulkEncryptPayload,
  BulkEncryptedData,
  BulkDecryptPayload,
  BulkDecryptedData,
  DecryptionResult,
  QuerySearchTerm,
  JsonSearchTerm,
  JsonPath,
  JsonPathSearchTerm,
  JsonContainmentSearchTerm,
  // New unified QueryTerm types
  QueryTerm,
  ScalarQueryTermBase,
  JsonQueryTermBase,
  ScalarQueryTerm,
  JsonPathQueryTerm,
  JsonContainsQueryTerm,
  JsonContainedByQueryTerm,
  // Query option types (used in ScalarQueryTerm)
  QueryTypeName,
  QueryOpName,
} from './types'

// Export queryTypes constant for explicit query type selection
export { queryTypes } from './types'

// Export type guards
export {
  isScalarQueryTerm,
  isJsonPathQueryTerm,
  isJsonContainsQueryTerm,
  isJsonContainedByQueryTerm,
} from './query-term-guards'
export type { JsPlaintext } from '@cipherstash/protect-ffi'