import type {
  ProtectDynamoDBConfig,
  ProtectDynamoDBInstance,
  ProtectDynamoDBError,
} from './types'
import type { EncryptedPayload, SearchTerm } from '@cipherstash/protect'
import type { ProtectTable, ProtectTableColumn } from '@cipherstash/protect'
import { withResult } from '@byteslice/result'

const ciphertextAttrSuffix = '__source'
const searchTermAttrSuffix = '__hmac'

class ProtectDynamoDBErrorImpl extends Error implements ProtectDynamoDBError {
  constructor(
    message: string,
    public code: string,
    public details?: Record<string, unknown>,
  ) {
    super(message)
    this.name = 'ProtectDynamoDBError'
  }
}

function deepClone<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') {
    return obj
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => deepClone(item)) as unknown as T
  }

  return Object.entries(obj as Record<string, unknown>).reduce(
    (acc, [key, value]) => ({
      // biome-ignore lint/performance/noAccumulatingSpread: TODO later
      ...acc,
      [key]: deepClone(value),
    }),
    {} as T,
  )
}

function toEncryptedDynamoItem(
  encrypted: Record<string, unknown>,
  encryptedAttrs: string[],
): Record<string, unknown> {
  function processValue(
    attrName: string,
    attrValue: unknown,
    isNested: boolean,
  ): Record<string, unknown> {
    if (attrValue === null || attrValue === undefined) {
      return { [attrName]: attrValue }
    }

    // Handle encrypted payload
    if (
      encryptedAttrs.includes(attrName) ||
      (isNested &&
        typeof attrValue === 'object' &&
        'c' in (attrValue as object))
    ) {
      const encryptPayload = attrValue as EncryptedPayload
      if (encryptPayload?.c) {
        const result: Record<string, unknown> = {}
        if (encryptPayload.hm) {
          result[`${attrName}${searchTermAttrSuffix}`] = encryptPayload.hm
        }
        result[`${attrName}${ciphertextAttrSuffix}`] = encryptPayload.c
        return result
      }
    }

    // Handle nested objects recursively
    if (typeof attrValue === 'object' && !Array.isArray(attrValue)) {
      const nestedResult = Object.entries(
        attrValue as Record<string, unknown>,
      ).reduce(
        (acc, [key, val]) => {
          const processed = processValue(key, val, true)
          return Object.assign({}, acc, processed)
        },
        {} as Record<string, unknown>,
      )
      return { [attrName]: nestedResult }
    }

    // Handle non-encrypted values
    return { [attrName]: attrValue }
  }

  return Object.entries(encrypted).reduce(
    (putItem, [attrName, attrValue]) => {
      const processed = processValue(attrName, attrValue, false)
      return Object.assign({}, putItem, processed)
    },
    {} as Record<string, unknown>,
  )
}

function toItemWithEqlPayloads(
  decrypted: Record<string, EncryptedPayload | unknown>,
  encryptedAttrs: string[],
): Record<string, unknown> {
  function processValue(
    attrName: string,
    attrValue: unknown,
    isNested: boolean,
  ): Record<string, unknown> {
    if (attrValue === null || attrValue === undefined) {
      return { [attrName]: attrValue }
    }

    // Skip HMAC fields
    if (attrName.endsWith(searchTermAttrSuffix)) {
      return {}
    }

    // Handle encrypted payload
    if (
      attrName.endsWith(ciphertextAttrSuffix) &&
      (encryptedAttrs.includes(
        attrName.slice(0, -ciphertextAttrSuffix.length),
      ) ||
        isNested)
    ) {
      const baseName = attrName.slice(0, -ciphertextAttrSuffix.length)
      return {
        [baseName]: {
          c: attrValue,
          bf: null,
          hm: null,
          i: { c: 'notUsed', t: 'notUsed' },
          k: 'notUsed',
          ob: null,
          v: 2,
        },
      }
    }

    // Handle nested objects recursively
    if (typeof attrValue === 'object' && !Array.isArray(attrValue)) {
      const nestedResult = Object.entries(
        attrValue as Record<string, unknown>,
      ).reduce(
        (acc, [key, val]) => {
          const processed = processValue(key, val, true)
          return Object.assign({}, acc, processed)
        },
        {} as Record<string, unknown>,
      )
      return { [attrName]: nestedResult }
    }

    // Handle non-encrypted values
    return { [attrName]: attrValue }
  }

  return Object.entries(decrypted).reduce(
    (formattedItem, [attrName, attrValue]) => {
      const processed = processValue(attrName, attrValue, false)
      return Object.assign({}, formattedItem, processed)
    },
    {} as Record<string, unknown>,
  )
}

export function protectDynamoDB(
  config: ProtectDynamoDBConfig,
): ProtectDynamoDBInstance {
  const { protectClient, options } = config
  const logger = options?.logger

  const handleError = (error: Error, context: string): ProtectDynamoDBError => {
    const protectError = new ProtectDynamoDBErrorImpl(
      error.message,
      'PROTECT_DYNAMODB_ERROR',
      { context },
    )

    if (options?.errorHandler) {
      options.errorHandler(protectError)
    }

    if (logger) {
      logger.error(`Error in ${context}`, protectError)
    }

    return protectError
  }

  return {
    async encryptModel<T extends Record<string, unknown>>(
      item: T,
      protectTable: ProtectTable<ProtectTableColumn>,
    ) {
      return await withResult(
        async () => {
          const encryptResult = await protectClient.encryptModel(
            deepClone(item),
            protectTable,
          )

          if (encryptResult.failure) {
            throw new Error(
              `encryption error: ${encryptResult.failure.message}`,
            )
          }

          const data = deepClone(encryptResult.data)
          const encryptedAttrs = Object.keys(protectTable.build().columns)

          return toEncryptedDynamoItem(data, encryptedAttrs) as T
        },
        (error) => handleError(error, 'encryptModel'),
      )
    },

    async bulkEncryptModels<T extends Record<string, unknown>>(
      items: T[],
      protectTable: ProtectTable<ProtectTableColumn>,
    ) {
      return await withResult(
        async () => {
          const encryptResult = await protectClient.bulkEncryptModels(
            items.map((item) => deepClone(item)),
            protectTable,
          )

          if (encryptResult.failure) {
            throw new Error(
              `encryption error: ${encryptResult.failure.message}`,
            )
          }

          const data = encryptResult.data.map((item) => deepClone(item))
          const encryptedAttrs = Object.keys(protectTable.build().columns)

          return data.map(
            (encrypted) =>
              toEncryptedDynamoItem(encrypted, encryptedAttrs) as T,
          )
        },
        (error) => handleError(error, 'bulkEncryptModels'),
      )
    },

    async decryptModel<T extends Record<string, unknown>>(
      item: Record<string, EncryptedPayload | unknown>,
      protectTable: ProtectTable<ProtectTableColumn>,
    ) {
      return await withResult(
        async () => {
          const encryptedAttrs = Object.keys(protectTable.build().columns)
          const withEqlPayloads = toItemWithEqlPayloads(item, encryptedAttrs)

          const decryptResult = await protectClient.decryptModel<T>(
            withEqlPayloads as T,
          )

          if (decryptResult.failure) {
            throw new Error(`[protect]: ${decryptResult.failure.message}`)
          }

          return decryptResult.data
        },
        (error) => handleError(error, 'decryptModel'),
      )
    },

    async bulkDecryptModels<T extends Record<string, unknown>>(
      items: Record<string, EncryptedPayload | unknown>[],
      protectTable: ProtectTable<ProtectTableColumn>,
    ) {
      return await withResult(
        async () => {
          const encryptedAttrs = Object.keys(protectTable.build().columns)
          const itemsWithEqlPayloads = items.map((item) =>
            toItemWithEqlPayloads(item, encryptedAttrs),
          )

          const decryptResult = await protectClient.bulkDecryptModels<T>(
            itemsWithEqlPayloads as T[],
          )

          if (decryptResult.failure) {
            throw new Error(`[protect]: ${decryptResult.failure.message}`)
          }

          return decryptResult.data
        },
        (error) => handleError(error, 'bulkDecryptModels'),
      )
    },

    async createSearchTerms(terms: SearchTerm[]) {
      return await withResult(
        async () => {
          const searchTermsResult = await protectClient.createSearchTerms(terms)

          if (searchTermsResult.failure) {
            throw new Error(`[protect]: ${searchTermsResult.failure.message}`)
          }

          return searchTermsResult.data.map((term) => {
            if (typeof term === 'string') {
              throw new Error(
                'expected encrypted search term to be an EncryptedPayload',
              )
            }

            if (!term?.hm) {
              throw new Error('expected encrypted search term to have an HMAC')
            }

            return term.hm
          })
        },
        (error) => handleError(error, 'createSearchTerms'),
      )
    },
  }
}

export * from './types'
