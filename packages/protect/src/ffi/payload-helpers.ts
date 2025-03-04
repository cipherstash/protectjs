import type { Result } from '@byteslice/result'
import type { ProtectError } from '..'
import type {
  BulkDecryptPayload as InternalBulkDecryptPayload,
  BulkEncryptPayload as InternalBulkEncryptPayload,
} from '@cipherstash/protect-ffi'

import type { LockContext } from '../identify'
import type { BulkEncryptPayload, BulkEncryptedData } from './index'

const getLockContextPayload = async (lockContext: LockContext) =>
  await lockContext.getLockContext()

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

export async function normalizeBulkDecryptPayloadsWithLockContext(
  encryptedPayloads: BulkEncryptedData,
  lockContext: LockContext,
): Promise<Result<InternalBulkDecryptPayload[], ProtectError>> {
  const lockContextPayload = await getLockContextPayload(lockContext)

  if (lockContextPayload.failure) return lockContextPayload
  if (!encryptedPayloads) return { data: [] }

  return {
    data: encryptedPayloads?.reduce((acc, encryptedPayload) => {
      const payload = {
        ciphertext: encryptedPayload.c,
        ...lockContextPayload,
      }

      acc.push(payload)
      return acc
    }, [] as InternalBulkDecryptPayload[]),
  }
}

export async function normalizeBulkEncryptPayloadsWithLockContext(
  plaintexts: BulkEncryptPayload,
  column: string,
  table: string,
  lockContext: LockContext,
): Promise<Result<InternalBulkEncryptPayload[], ProtectError>> {
  const lockContextPayload = await getLockContextPayload(lockContext)

  if (lockContextPayload.failure) return lockContextPayload
  if (!plaintexts) return { data: [] }

  return {
    data: plaintexts.reduce((acc, plaintext) => {
      const payload = {
        plaintext: plaintext.plaintext,
        column,
        table,
        ...lockContextPayload,
      }

      acc.push(payload)
      return acc
    }, [] as InternalBulkEncryptPayload[]),
  }
}
