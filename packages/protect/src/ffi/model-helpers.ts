import { decryptBulk, encryptBulk } from '@cipherstash/protect-ffi'
import type { EncryptedPayload, Decrypted, Client } from '../types'
import type { ProtectTable, ProtectTableColumn } from '../schema'
import type { GetLockContextResponse } from '../identify'

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
 * Base interface for bulk operation payloads
 */
interface BulkOperationPayload {
  id: string
  [key: string]: unknown
}

/**
 * Interface for bulk operation key mapping
 */
interface BulkOperationKeyMap {
  modelIndex: number
  fieldKey: string
}

/**
 * Helper function to handle single model bulk operations with mapping
 */
async function handleSingleModelBulkOperation<
  T extends BulkOperationPayload,
  R,
>(
  items: T[],
  operation: (items: T[]) => Promise<R[]>,
  keyMap: Record<string, string>,
): Promise<Record<string, R>> {
  if (items.length === 0) {
    return {}
  }

  const results = await operation(items)
  const mappedResults: Record<string, R> = {}

  results.forEach((result, index) => {
    const originalKey = keyMap[index.toString()]
    mappedResults[originalKey] = result
  })

  return mappedResults
}

/**
 * Helper function to handle multiple model bulk operations with mapping
 */
async function handleMultiModelBulkOperation<T extends BulkOperationPayload, R>(
  items: T[],
  operation: (items: T[]) => Promise<R[]>,
  keyMap: Record<string, BulkOperationKeyMap>,
): Promise<Record<string, R>> {
  if (items.length === 0) {
    return {}
  }

  const results = await operation(items)
  const mappedResults: Record<string, R> = {}

  results.forEach((result, index) => {
    const key = index.toString()
    const { modelIndex, fieldKey } = keyMap[key]
    mappedResults[`${modelIndex}-${fieldKey}`] = result
  })

  return mappedResults
}

/**
 * Helper function to prepare fields for encryption/decryption
 */
function prepareFieldsForOperation<T extends Record<string, unknown>>(
  model: T,
  table?: ProtectTable<ProtectTableColumn>,
): {
  otherFields: Record<string, unknown>
  operationFields: Record<string, unknown>
  keyMap: Record<string, string>
  nullFields: Record<string, null>
} {
  const otherFields = extractOtherFields(model)
  const operationFields: Record<string, unknown> = {}
  const nullFields: Record<string, null> = {}
  const keyMap: Record<string, string> = {}
  let index = 0

  const fieldsToProcess = table
    ? Object.entries(model).filter(([key]) =>
        Object.keys(table.build().columns).includes(key),
      )
    : Object.entries(extractEncryptedFields(model))

  for (const [key, value] of fieldsToProcess) {
    if (value === null) {
      nullFields[key] = null
      continue
    }

    const id = index.toString()
    keyMap[id] = key
    operationFields[key] = value
    index++
  }

  return { otherFields, operationFields, keyMap, nullFields }
}

/**
 * Helper function to convert a model with encrypted fields to a decrypted model
 */
export async function decryptModelFields<T extends Record<string, unknown>>(
  model: T,
  client: Client,
): Promise<Decrypted<T>> {
  if (!client) {
    throw new Error('Client not initialized')
  }

  const { otherFields, operationFields, keyMap, nullFields } =
    prepareFieldsForOperation(model)

  const bulkDecryptPayload = Object.entries(operationFields).map(
    ([key, value]) => ({
      id: key,
      ciphertext: (value as EncryptedPayload).c as string,
    }),
  )

  const decryptedFields = await handleSingleModelBulkOperation(
    bulkDecryptPayload,
    (items) => decryptBulk(client, items),
    keyMap,
  )

  return { ...otherFields, ...nullFields, ...decryptedFields } as Decrypted<T>
}

/**
 * Helper function to convert a decrypted model to a model with encrypted fields
 */
export async function encryptModelFields<T extends Record<string, unknown>>(
  model: Decrypted<T>,
  table: ProtectTable<ProtectTableColumn>,
  client: Client,
): Promise<T> {
  if (!client) {
    throw new Error('Client not initialized')
  }

  const { otherFields, operationFields, keyMap, nullFields } =
    prepareFieldsForOperation(model, table)

  const bulkEncryptPayload = Object.entries(operationFields).map(
    ([key, value]) => ({
      id: key,
      plaintext: value as string,
      table: table.tableName,
      column: key,
    }),
  )

  const encryptedData = await handleSingleModelBulkOperation(
    bulkEncryptPayload,
    (items) =>
      encryptBulk(client, items).then((results) =>
        results.map((item) => JSON.parse(item) as EncryptedPayload),
      ),
    keyMap,
  )

  return { ...otherFields, ...nullFields, ...encryptedData } as T
}

/**
 * Helper function to convert a model with encrypted fields to a decrypted model with lock context
 */
export async function decryptModelFieldsWithLockContext<
  T extends Record<string, unknown>,
>(
  model: T,
  client: Client,
  lockContext: GetLockContextResponse,
): Promise<Decrypted<T>> {
  if (!client) {
    throw new Error('Client not initialized')
  }

  if (!lockContext) {
    throw new Error('Lock context is not initialized')
  }

  const { otherFields, operationFields, keyMap, nullFields } =
    prepareFieldsForOperation(model)

  const bulkDecryptPayload = Object.entries(operationFields).map(
    ([key, value]) => ({
      id: key,
      ciphertext: (value as EncryptedPayload).c as string,
      lockContext: lockContext.context,
    }),
  )

  const decryptedFields = await handleSingleModelBulkOperation(
    bulkDecryptPayload,
    (items) => decryptBulk(client, items, lockContext.ctsToken),
    keyMap,
  )

  return { ...otherFields, ...nullFields, ...decryptedFields } as Decrypted<T>
}

/**
 * Helper function to convert a decrypted model to a model with encrypted fields with lock context
 */
export async function encryptModelFieldsWithLockContext<
  T extends Record<string, unknown>,
>(
  model: Decrypted<T>,
  table: ProtectTable<ProtectTableColumn>,
  client: Client,
  lockContext: GetLockContextResponse,
): Promise<T> {
  if (!client) {
    throw new Error('Client not initialized')
  }

  if (!lockContext) {
    throw new Error('Lock context is not initialized')
  }

  const { otherFields, operationFields, keyMap, nullFields } =
    prepareFieldsForOperation(model, table)

  const bulkEncryptPayload = Object.entries(operationFields).map(
    ([key, value]) => ({
      id: key,
      plaintext: value as string,
      table: table.tableName,
      column: key,
      lockContext: lockContext.context,
    }),
  )

  const encryptedData = await handleSingleModelBulkOperation(
    bulkEncryptPayload,
    (items) =>
      encryptBulk(client, items, lockContext.ctsToken).then((results) =>
        results.map((item) => JSON.parse(item) as EncryptedPayload),
      ),
    keyMap,
  )

  return { ...otherFields, ...nullFields, ...encryptedData } as T
}

/**
 * Helper function to prepare multiple models for bulk operation
 */
function prepareBulkModelsForOperation<T extends Record<string, unknown>>(
  models: T[],
  table?: ProtectTable<ProtectTableColumn>,
): {
  otherFields: Record<string, unknown>[]
  operationFields: Record<string, unknown>[]
  keyMap: Record<string, { modelIndex: number; fieldKey: string }>
  nullFields: Record<string, null>[]
} {
  const otherFields: Record<string, unknown>[] = []
  const operationFields: Record<string, unknown>[] = []
  const nullFields: Record<string, null>[] = []
  const keyMap: Record<string, { modelIndex: number; fieldKey: string }> = {}
  let index = 0

  for (let modelIndex = 0; modelIndex < models.length; modelIndex++) {
    const model = models[modelIndex]
    const modelOtherFields = extractOtherFields(model)
    const modelOperationFields: Record<string, unknown> = {}
    const modelNullFields: Record<string, null> = {}

    const fieldsToProcess = table
      ? Object.entries(model).filter(([key]) =>
          Object.keys(table.build().columns).includes(key),
        )
      : Object.entries(extractEncryptedFields(model))

    for (const [key, value] of fieldsToProcess) {
      if (value === null) {
        modelNullFields[key] = null
        continue
      }

      const id = index.toString()
      keyMap[id] = { modelIndex, fieldKey: key }
      modelOperationFields[key] = value
      index++
    }

    otherFields.push(modelOtherFields)
    operationFields.push(modelOperationFields)
    nullFields.push(modelNullFields)
  }

  return { otherFields, operationFields, keyMap, nullFields }
}

/**
 * Helper function to convert multiple decrypted models to models with encrypted fields
 */
export async function bulkEncryptModels<T extends Record<string, unknown>>(
  models: Decrypted<T>[],
  table: ProtectTable<ProtectTableColumn>,
  client: Client,
): Promise<T[]> {
  if (!client) {
    throw new Error('Client not initialized')
  }

  if (!models || models.length === 0) {
    return []
  }

  const { otherFields, operationFields, keyMap, nullFields } =
    prepareBulkModelsForOperation(models, table)

  // Collect all fields that need to be encrypted into a single array
  const bulkEncryptPayload = operationFields.flatMap((fields, modelIndex) =>
    Object.entries(fields).map(([key, value]) => ({
      id: `${modelIndex}-${key}`,
      plaintext: value as string,
      table: table.tableName,
      column: key,
    })),
  )

  // Make a single FFI call for all fields
  const encryptedData = await handleMultiModelBulkOperation(
    bulkEncryptPayload,
    (items) =>
      encryptBulk(client, items).then((results) =>
        results.map((item) => JSON.parse(item) as EncryptedPayload),
      ),
    keyMap,
  )

  // Reconstruct models
  return models.map((_, modelIndex) => ({
    ...otherFields[modelIndex],
    ...nullFields[modelIndex],
    ...Object.fromEntries(
      Object.entries(encryptedData)
        .filter(([key]) => {
          const [idx] = key.split('-')
          return Number.parseInt(idx) === modelIndex
        })
        .map(([key, value]) => {
          const [_, fieldKey] = key.split('-')
          return [fieldKey, value]
        }),
    ),
  })) as T[]
}

/**
 * Helper function to convert multiple models with encrypted fields to decrypted models
 */
export async function bulkDecryptModels<T extends Record<string, unknown>>(
  models: T[],
  client: Client,
): Promise<Decrypted<T>[]> {
  if (!client) {
    throw new Error('Client not initialized')
  }

  if (!models || models.length === 0) {
    return []
  }

  const { otherFields, operationFields, keyMap, nullFields } =
    prepareBulkModelsForOperation(models)

  // Collect all fields that need to be decrypted into a single array
  const bulkDecryptPayload = operationFields.flatMap((fields, modelIndex) =>
    Object.entries(fields).map(([key, value]) => ({
      id: `${modelIndex}-${key}`,
      ciphertext: (value as EncryptedPayload).c as string,
    })),
  )

  // Make a single FFI call for all fields
  const decryptedFields = await handleMultiModelBulkOperation(
    bulkDecryptPayload,
    (items) => decryptBulk(client, items),
    keyMap,
  )

  // Reconstruct models
  return models.map((_, modelIndex) => ({
    ...otherFields[modelIndex],
    ...nullFields[modelIndex],
    ...Object.fromEntries(
      Object.entries(decryptedFields)
        .filter(([key]) => {
          const [idx] = key.split('-')
          return Number.parseInt(idx) === modelIndex
        })
        .map(([key, value]) => {
          const [_, fieldKey] = key.split('-')
          return [fieldKey, value]
        }),
    ),
  })) as Decrypted<T>[]
}

/**
 * Helper function to convert multiple models with encrypted fields to decrypted models with lock context
 */
export async function bulkDecryptModelsWithLockContext<
  T extends Record<string, unknown>,
>(
  models: T[],
  client: Client,
  lockContext: GetLockContextResponse,
): Promise<Decrypted<T>[]> {
  if (!client) {
    throw new Error('Client not initialized')
  }

  if (!lockContext) {
    throw new Error('Lock context is not initialized')
  }

  const { otherFields, operationFields, keyMap, nullFields } =
    prepareBulkModelsForOperation(models)

  const bulkDecryptPayload = operationFields.flatMap((fields, modelIndex) =>
    Object.entries(fields).map(([key, value]) => ({
      id: `${modelIndex}-${key}`,
      ciphertext: (value as EncryptedPayload).c as string,
      lockContext: lockContext.context,
    })),
  )

  const decryptedFields = await handleMultiModelBulkOperation(
    bulkDecryptPayload,
    (items) => decryptBulk(client, items, lockContext.ctsToken),
    keyMap,
  )

  // Reconstruct models
  return models.map((_, modelIndex) => ({
    ...otherFields[modelIndex],
    ...nullFields[modelIndex],
    ...Object.fromEntries(
      Object.entries(decryptedFields)
        .filter(([key]) => {
          const [idx] = key.split('-')
          return Number.parseInt(idx) === modelIndex
        })
        .map(([key, value]) => {
          const [_, fieldKey] = key.split('-')
          return [fieldKey, value]
        }),
    ),
  })) as Decrypted<T>[]
}

/**
 * Helper function to convert multiple decrypted models to models with encrypted fields with lock context
 */
export async function bulkEncryptModelsWithLockContext<
  T extends Record<string, unknown>,
>(
  models: Decrypted<T>[],
  table: ProtectTable<ProtectTableColumn>,
  client: Client,
  lockContext: GetLockContextResponse,
): Promise<T[]> {
  if (!client) {
    throw new Error('Client not initialized')
  }

  if (!lockContext) {
    throw new Error('Lock context is not initialized')
  }

  const { otherFields, operationFields, keyMap, nullFields } =
    prepareBulkModelsForOperation(models, table)

  const bulkEncryptPayload = operationFields.flatMap((fields, modelIndex) =>
    Object.entries(fields).map(([key, value]) => ({
      id: `${modelIndex}-${key}`,
      plaintext: value as string,
      table: table.tableName,
      column: key,
      lockContext: lockContext.context,
    })),
  )

  const encryptedData = await handleMultiModelBulkOperation(
    bulkEncryptPayload,
    (items) =>
      encryptBulk(client, items, lockContext.ctsToken).then((results) =>
        results.map((item) => JSON.parse(item) as EncryptedPayload),
      ),
    keyMap,
  )

  // Reconstruct models
  return models.map((_, modelIndex) => ({
    ...otherFields[modelIndex],
    ...nullFields[modelIndex],
    ...Object.fromEntries(
      Object.entries(encryptedData)
        .filter(([key]) => {
          const [idx] = key.split('-')
          return Number.parseInt(idx) === modelIndex
        })
        .map(([key, value]) => {
          const [_, fieldKey] = key.split('-')
          return [fieldKey, value]
        }),
    ),
  })) as T[]
}
