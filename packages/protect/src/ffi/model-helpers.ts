import { decryptBulk, encryptBulk } from '@cipherstash/protect-ffi'
import type { Result } from '@byteslice/result'
import type { ProtectError } from '..'
import type { EncryptedPayload, Decrypted, Client } from '../types'
import type { ProtectTable, ProtectTableColumn } from '../schema'

/**
 * Helper function to extract encrypted fields from a model
 */
export function extractEncryptedFields<T extends Record<string, unknown>>(
  model: T,
): Record<string, EncryptedPayload> {
  const result: Record<string, EncryptedPayload> = {}

  for (const [key, value] of Object.entries(model)) {
    if (isEncryptedPayload(value)) {
      result[key] = value
    }
  }

  return result
}

/**
 * Helper function to extract non-encrypted fields from a model
 */
export function extractOtherFields<T extends Record<string, unknown>>(
  model: T,
): Record<string, unknown> {
  const result: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(model)) {
    if (!isEncryptedPayload(value)) {
      result[key] = value
    }
  }

  return result
}

/**
 * Helper function to check if a value is an encrypted payload
 */
export function isEncryptedPayload(value: unknown): value is EncryptedPayload {
  if (value === null) return false

  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>
    return 'v' in obj && 'k' in obj && 'i' in obj
  }

  return false
}

/**
 * Helper function to merge encrypted and non-encrypted fields into a model
 */
export function mergeFields<T>(
  otherFields: Record<string, unknown>,
  encryptedFields: Record<string, EncryptedPayload>,
): T {
  return { ...otherFields, ...encryptedFields } as T
}

/**
 * Helper function to convert a model with encrypted fields to a decrypted model
 */
export async function decryptModelFields<T extends Record<string, unknown>>(
  model: T,
  client: Client,
): Promise<Result<Decrypted<T>, ProtectError>> {
  if (!client) {
    throw new Error('Client not initialized')
  }

  const encryptedFields = extractEncryptedFields(model)
  const otherFields = extractOtherFields(model)

  const decryptedFields: Record<string, string | null> = {}
  const bulkDecryptPayload = []
  const keyOrder: string[] = []

  // Build up array of items to decrypt
  for (const [key, value] of Object.entries(encryptedFields)) {
    if (value === null) {
      decryptedFields[key] = null
      continue
    }

    keyOrder.push(key)
    bulkDecryptPayload.push({
      id: key,
      ciphertext: value.c as string,
    })
  }

  // Decrypt in bulk if we have items
  if (bulkDecryptPayload.length > 0) {
    const decrypted = await decryptBulk(client, bulkDecryptPayload)

    // Map decrypted values back to their original keys
    decrypted.forEach((value, index) => {
      const originalKey = keyOrder[index]
      decryptedFields[originalKey] = value
    })
  }

  return {
    data: { ...otherFields, ...decryptedFields } as Decrypted<T>,
    failure: undefined,
  }
}

/**
 * Helper function to convert a decrypted model to a model with encrypted fields
 */
export async function encryptModelFields<T extends Record<string, unknown>>(
  model: Decrypted<T>,
  table: ProtectTable<ProtectTableColumn>,
  client: Client,
): Promise<Result<T, ProtectError>> {
  if (!client) {
    throw new Error('Client not initialized')
  }

  const otherFields = extractOtherFields(model)
  const encryptedFields: Record<string, EncryptedPayload | null> = {}
  const bulkEncryptPayload = []
  const keyMap: Record<string, string> = {}

  // Get the table definition to access column names
  const tableDefinition = table.build()
  const columnNames = Object.keys(tableDefinition.columns)

  // Find fields that should be encrypted based on the table columns
  let index = 0
  for (const [key, value] of Object.entries(model)) {
    // Check if this field is a column in the table
    if (columnNames.includes(key)) {
      if (value === null) {
        encryptedFields[key] = null
        continue
      }

      const id = index.toString()
      keyMap[id] = key
      bulkEncryptPayload.push({
        id,
        plaintext: value as string,
        table: table.tableName,
        column: key,
      })
      index++
    }
  }

  // Encrypt in bulk if we have items
  if (bulkEncryptPayload.length > 0) {
    const result = await encryptBulk(client, bulkEncryptPayload)

    const encryptedData = result.map(
      (item) => JSON.parse(item) as EncryptedPayload,
    )

    // Map encrypted values back to their original keys
    if (encryptedData) {
      encryptedData.forEach((result, index) => {
        const originalKey = keyMap[index.toString()]
        encryptedFields[originalKey] = result
      })
    }
  }

  return {
    data: { ...otherFields, ...encryptedFields } as T,
    failure: undefined,
  }
}
