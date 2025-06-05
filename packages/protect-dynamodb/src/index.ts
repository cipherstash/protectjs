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

function toEncryptedDynamoItem(
  encrypted: Record<string, unknown>,
  encryptedAttrs: string[],
): Record<string, unknown> {
  return Object.entries(encrypted).reduce(
    (putItem, [attrName, attrValue]) => {
      if (encryptedAttrs.includes(attrName)) {
        const encryptPayload = attrValue as EncryptedPayload
        if (encryptPayload?.hm && encryptPayload?.c) {
          putItem[`${attrName}${searchTermAttrSuffix}`] = encryptPayload.hm
          putItem[`${attrName}${ciphertextAttrSuffix}`] = encryptPayload.c
        }
      } else {
        putItem[attrName] = attrValue
      }
      return putItem
    },
    {} as Record<string, unknown>,
  )
}

function toItemWithEqlPayloads(
  decrypted: Record<string, EncryptedPayload | unknown>,
  encryptedAttrs: string[],
): Record<string, unknown> {
  return Object.entries(decrypted).reduce(
    (formattedItem, [attrName, attrValue]) => {
      if (
        attrName.endsWith(ciphertextAttrSuffix) &&
        encryptedAttrs.includes(attrName.slice(0, -ciphertextAttrSuffix.length))
      ) {
        formattedItem[attrName.slice(0, -ciphertextAttrSuffix.length)] = {
          c: attrValue,
          bf: null,
          hm: null,
          i: { c: 'notUsed', t: 'notUsed' },
          k: 'notUsed',
          ob: null,
          v: 2,
        }
      } else if (attrName.endsWith(searchTermAttrSuffix)) {
        // skip HMAC attrs since we don't need those for decryption
      } else {
        formattedItem[attrName] = attrValue
      }
      return formattedItem
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
            item,
            protectTable,
          )

          if (encryptResult.failure) {
            throw new Error(
              `encryption error: ${encryptResult.failure.message}`,
            )
          }

          const data = encryptResult.data
          const encryptedAttrs = Object.keys(protectTable.build().columns)

          return toEncryptedDynamoItem(data, encryptedAttrs)
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
            items,
            protectTable,
          )

          if (encryptResult.failure) {
            throw new Error(
              `encryption error: ${encryptResult.failure.message}`,
            )
          }

          const data = encryptResult.data
          const encryptedAttrs = Object.keys(protectTable.build().columns)

          return data.map((encrypted) =>
            toEncryptedDynamoItem(encrypted, encryptedAttrs),
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
