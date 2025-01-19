import type {
  BulkEncryptPayload as InternalBulkEncryptPayload,
  BulkDecryptPayload as InternalBulkDecryptPayload,
} from '@cipherstash/jseql-ffi'

import type { BulkEncryptPayload, BulkEncryptedData } from './index'
import type { LockContext } from '../identify'

const getLockContextPayload = (lockContext?: LockContext) => {
  if (!lockContext) {
    return {}
  }

  return {
    lockContext: lockContext.getLockContext().context,
  }
}

export const normalizeBulkDecryptPayloads = (
  encryptedPayloads: BulkEncryptedData,
  lockContext?: LockContext,
) =>
  encryptedPayloads?.reduce((acc, encryptedPayload) => {
    const payload = {
      ciphertext: encryptedPayload.c,
      ...getLockContextPayload(lockContext),
    }

    acc.push(payload)
    return acc
  }, [] as InternalBulkDecryptPayload[])

export const normalizeBulkEncryptPayloads = (
  plaintexts: BulkEncryptPayload,
  column: string,
  lockContext?: LockContext,
) =>
  plaintexts.reduce((acc, plaintext) => {
    const payload = {
      plaintext: plaintext.plaintext,
      column,
      ...getLockContextPayload(lockContext),
    }

    acc.push(payload)
    return acc
  }, [] as InternalBulkEncryptPayload[])
