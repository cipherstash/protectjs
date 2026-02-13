import { EncryptionClient } from '@/encryption/ffi'
import { buildEncryptConfig } from '@/schema'
import type { EncryptionClientConfig } from '@/types'

// Re-export schema builders for convenience
export { encryptedTable, encryptedColumn, encryptedValue } from '@/schema'
export type {
  InferPlaintext,
  InferEncrypted,
  ProtectColumn,
  ProtectTable,
  ProtectTableColumn,
  ProtectValue,
} from '@/schema'

// Re-export error types
export { EncryptionErrorTypes, getErrorMessage } from '@/errors'
export type {
  EncryptionError,
  StackError,
  ClientInitError,
  EncryptionOperationError,
  DecryptionOperationError,
  LockContextError,
  CtsTokenError,
} from '@/errors'

function isValidUuid(uuid: string): boolean {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  return uuidRegex.test(uuid)
}

/** Initialize an Encryption client with the provided configuration.

  @param config - The configuration object for initializing the Encryption client.

  @see {@link EncryptionClientConfig} for details on the configuration options.

  @returns A Promise that resolves to an instance of EncryptionClient.

  @throws Will throw an error if no schemas are provided or if the keyset ID is not a valid UUID.
*/
export const Encryption = async (
  config: EncryptionClientConfig,
): Promise<EncryptionClient> => {
  const { schemas, config: clientConfig } = config

  if (!schemas.length) {
    throw new Error(
      '[encryption]: At least one encryptedTable must be provided to initialize the encryption client',
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
  const encryptConfig = buildEncryptConfig(...schemas)

  const result = await client.init({
    encryptConfig,
    ...clientConfig,
  })

  if (result.failure) {
    throw new Error(`[encryption]: ${result.failure.message}`)
  }

  return result.data
}
