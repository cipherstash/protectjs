import type {
  BulkEncryptPayload as InternalBulkEncryptPayload,
  BulkDecryptPayload as InternalBulkDecryptPayload,
} from '@cipherstash/jseql-ffi'

import type { BulkEncryptPayload, BulkEncryptedData } from './index'
import type { LockContext } from '../identify'

const getLockContextPayload = (
  usingLockContext: boolean,
  lockContext?: LockContext,
) => {
  if (!usingLockContext) {
    return {}
  }

  if (!lockContext) {
    throw new Error(
      '[jseql]: LockContext is required when using a lock context',
    )
  }

  const context = lockContext.getLockContext()

  if (!context.ctsToken?.accessToken) {
    throw new Error(
      '[jseql]: LockContext must be initialized with a valid CTS token before using it.',
    )
  }

  return {
    lockContext: context.context,
  }
}

export const normalizeBulkDecryptPayloads = (
  encryptedPayloads: BulkEncryptedData,
  usingLockContext: boolean,
  lockContext?: LockContext,
) =>
  encryptedPayloads?.reduce((acc, encryptedPayload) => {
    const payload = {
      ciphertext: encryptedPayload.c,
      ...getLockContextPayload(usingLockContext, lockContext),
    }

    acc.push(payload)
    return acc
  }, [] as InternalBulkDecryptPayload[])

export const normalizeBulkEncryptPayloads = (
  plaintexts: BulkEncryptPayload,
  column: string,
  usingLockContext: boolean,
  lockContext?: LockContext,
) =>
  plaintexts.reduce((acc, plaintext) => {
    const payload = {
      plaintext: plaintext.plaintext,
      column,
      ...getLockContextPayload(usingLockContext, lockContext),
    }

    acc.push(payload)
    return acc
  }, [] as InternalBulkEncryptPayload[])
