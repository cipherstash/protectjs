import { ProtectClient } from './ffi'
import {
  type ProtectTable,
  type ProtectTableColumn,
  buildEncryptConfig,
} from './schema'

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

export const protect = async (
  ...tables: Array<ProtectTable<ProtectTableColumn>>
): Promise<ProtectClient> => {
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
export * from './cs_plaintext_v1'
export * from './identify'
export * from './eql'
