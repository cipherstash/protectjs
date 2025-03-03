import { ProtectClient } from './ffi'
import type { EncryptConfig } from './ffi/encrypt-config'

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
  encryptConfig?: EncryptConfig,
): Promise<ProtectClient> => {
  const client = new ProtectClient()
  const result = await client.init(encryptConfig)

  if (result.failure) {
    throw new Error(`[protect]: ${result.failure.message}`)
  }

  return result.data
}

export type { Result } from '@byteslice/result'
export type { EncryptConfig } from './ffi/encrypt-config'
export type { ProtectClient } from './ffi'
export * from './cs_plaintext_v1'
export * from './identify'
export * from './eql'
