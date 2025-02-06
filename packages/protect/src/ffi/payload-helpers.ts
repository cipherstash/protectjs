import type {
  BulkDecryptPayload as InternalBulkDecryptPayload,
  BulkEncryptPayload as InternalBulkEncryptPayload,
} from '@cipherstash/jseql-ffi'

import type { LockContext } from '../identify'
import type { BulkEncryptPayload, BulkEncryptedData } from './index'

const getLockContextPayload = (lockContext: LockContext) => {
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
) =>
  encryptedPayloads?.reduce((acc, encryptedPayload) => {
    const payload = {
      ciphertext: encryptedPayload.c,
    }

    acc.push(payload)
    return acc
  }, [] as InternalBulkDecryptPayload[])

export const normalizeBulkEncryptPayloads = (
  plaintexts: BulkEncryptPayload,
  column: string,
) =>
  plaintexts.reduce((acc, plaintext) => {
    const payload = {
      plaintext: plaintext.plaintext,
      column,
    }

    acc.push(payload)
    return acc
  }, [] as InternalBulkEncryptPayload[])

export const normalizeBulkDecryptPayloadsWithLockContext = (
  encryptedPayloads: BulkEncryptedData,
  lockContext: LockContext,
) =>
  encryptedPayloads?.reduce((acc, encryptedPayload) => {
    const payload = {
      ciphertext: encryptedPayload.c,
      ...getLockContextPayload(lockContext),
    }

    acc.push(payload)
    return acc
  }, [] as InternalBulkDecryptPayload[])

export const normalizeBulkEncryptPayloadsWithLockContext = (
  plaintexts: BulkEncryptPayload,
  column: string,
  lockContext: LockContext,
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
