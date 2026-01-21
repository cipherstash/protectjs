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

export interface ProtectError {
  type: (typeof ProtectErrorTypes)[keyof typeof ProtectErrorTypes]
  message: string
}

type AtLeastOneCsTable<T> = [T, ...T[]]

export type ProtectClientConfig = {
  schemas: AtLeastOneCsTable<ProtectTable<ProtectTableColumn>>
  workspaceCrn?: string
  accessKey?: string
  clientId?: string
  clientKey?: string
  keyset?: KeysetIdentifier
}

function isValidUuid(uuid: string): boolean {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  return uuidRegex.test(uuid)
}

/* Initialize a Protect client with the provided configuration.

  @param config - The configuration object for initializing the Protect client.

  @see {@link ProtectClientConfig} for details on the configuration options.

  @returns A Promise that resolves to an instance of ProtectClient.

  @throws Will throw an error if no schemas are provided or if the keyset ID is not a valid UUID.
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
} from './types'

// Export type guards
export {
  isScalarQueryTerm,
  isJsonPathQueryTerm,
  isJsonContainsQueryTerm,
  isJsonContainedByQueryTerm,
} from './query-term-guards'
export type { JsPlaintext } from '@cipherstash/protect-ffi'
