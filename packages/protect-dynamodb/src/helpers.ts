import type { Encrypted } from '@cipherstash/protect'
import type { ProtectDynamoDBError } from './types'
export const ciphertextAttrSuffix = '__source'
export const searchTermAttrSuffix = '__hmac'

export class ProtectDynamoDBErrorImpl
  extends Error
  implements ProtectDynamoDBError
{
  constructor(
    message: string,
    public code: string,
    public details?: Record<string, unknown>,
  ) {
    super(message)
    this.name = 'ProtectDynamoDBError'
  }
}

export function handleError(
  error: Error,
  context: string,
  options?: {
    logger?: {
      error: (message: string, error: Error) => void
    }
    errorHandler?: (error: ProtectDynamoDBError) => void
  },
): ProtectDynamoDBError {
  const protectError = new ProtectDynamoDBErrorImpl(
    error.message,
    'PROTECT_DYNAMODB_ERROR',
    { context },
  )

  if (options?.errorHandler) {
    options.errorHandler(protectError)
  }

  if (options?.logger) {
    options.logger.error(`Error in ${context}`, protectError)
  }

  return protectError
}

export function deepClone<T>(obj: T): T {
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

export function toEncryptedDynamoItem(
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
      const encryptPayload = attrValue as Encrypted
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

export function toItemWithEqlPayloads(
  decrypted: Record<string, Encrypted | unknown>,
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

      // TODO: in order to support the ste_vec eql type, this needs to be updated
      return {
        [baseName]: {
          c: attrValue,
          i: { c: 'notUsed', t: 'notUsed' },
          k: 'ct',
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
