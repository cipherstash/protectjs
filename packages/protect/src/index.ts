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
export { csTable, csColumn, csValue } from '@cipherstash/schema'
export type {
  ProtectColumn,
  ProtectTable,
  ProtectTableColumn,
  ProtectValue,
} from '@cipherstash/schema'
export * from './helpers'
export * from './identify'
export * from './types'
