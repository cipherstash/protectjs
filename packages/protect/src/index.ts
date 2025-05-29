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
export const protect = async (
  ...tables: AtLeastOneCsTable<ProtectTable<ProtectTableColumn>>
): Promise<ProtectClient> => {
  if (!tables.length) {
    throw new Error(
      '[protect]: At least one csTable must be provided to initialize the protect client',
    )
  }

  const client = new ProtectClient()
  const encryptConfig = buildEncryptConfig(...tables)

  const result = await client.init(encryptConfig)

  if (result.failure) {
    throw new Error(`[protect]: ${result.failure.message}`)
  }

  return result.data
}

export type { Result } from '@byteslice/result'
export type { ProtectClient } from './ffi'
export { csTable, csColumn } from './schema'
export type { ProtectTable, ProtectTableColumn } from './schema'
export * from './helpers'
export * from './identify'
export * from './types'
