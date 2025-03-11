import type { Result } from '@byteslice/result'
import type { ProtectError } from '..'
import type {
  BulkDecryptPayload as InternalBulkDecryptPayload,
  EncryptPayload as InternalBulkEncryptPayload,
} from '@cipherstash/protect-ffi'

import type { LockContext } from '../identify'
import type { BulkEncryptPayload, BulkEncryptedData } from './index'

const getLockContextPayload = async (lockContext: LockContext) =>
  await lockContext.getLockContext()

export const normalizeBulkDecryptPayloads = (payload: BulkEncryptedData) =>
  payload?.reduce((acc, data) => {
    if (!data.encryptedData) {
      return acc
    }

    if (data.encryptedData.k !== 'ct') {
      throw new Error('The encrypted data is not compliant with the EQL schema')
    }

    const payload = {
      ciphertext: data.encryptedData.c,
    }

    acc.push(payload)
    return acc
  }, [] as InternalBulkDecryptPayload[])

export const normalizeBulkEncryptPayloads = (
  plaintexts: BulkEncryptPayload,
  column: string,
  table: string,
) =>
  plaintexts.reduce((acc, plaintext) => {
    const payload = {
      plaintext: plaintext.plaintext,
      column,
      table,
    }

    acc.push(payload)
    return acc
  }, [] as InternalBulkEncryptPayload[])

export async function normalizeBulkDecryptPayloadsWithLockContext(
  payloads: BulkEncryptedData,
  lockContext: LockContext,
): Promise<Result<InternalBulkDecryptPayload[], ProtectError>> {
  const lockContextPayload = await getLockContextPayload(lockContext)

  if (lockContextPayload.failure) return lockContextPayload
  if (!payloads) return { data: [] }

  return {
    data: payloads.reduce((acc, data) => {
      if (!data.encryptedData) {
        return acc
      }

      if (data.encryptedData.k !== 'ct') {
        throw new Error(
          'The encrypted data is not compliant with the EQL schema',
        )
      }

      const payload = {
        ciphertext: data.encryptedData.c,
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
