import { ProtectClient } from './ffi'
import type { ProtectTable, ProtectTableColumn } from './schema'
import { buildEncryptConfig } from './schema'

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

  const clientConfig = {
    workspaceCrn: config.workspaceCrn,
    accessKey: config.accessKey,
    clientId: config.clientId,
    clientKey: config.clientKey,
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
export { csTable, csColumn } from './schema'
export type { ProtectColumn, ProtectTable, ProtectTableColumn } from './schema'
export * from './helpers'
export * from './identify'
export * from './types'
