import { protect, csColumn, csTable } from '@cipherstash/protect'
import type { EncryptedPayload, ProtectClient } from '@cipherstash/protect'
import type {
  ProtectColumn,
  ProtectTable,
  ProtectTableColumn,
} from '@cipherstash/protect'

export const users = csTable('users', {
  email: csColumn('email').equality(),
})

export const protectClient = await protect(users)

export async function encryptModel(
  item: Record<string, unknown>,
  protectTable: ProtectTable<ProtectTableColumn>,
): Promise<Record<string, unknown>> {
  const encryptResult = await protectClient.encryptModel(item, protectTable)

  if (encryptResult.failure) {
    throw new Error(`encryption error: ${encryptResult.failure.message}`)
  }

  const data = encryptResult.data

  const encryptedAttrs = Object.keys(protectTable.build().columns)

  const encryptedItem = Object.entries(data).reduce(
    (putItem, [attrName, attrValue]) => {
      if (encryptedAttrs.includes(attrName)) {
        const encryptPayload = attrValue as EncryptedPayload

        putItem[`${attrName}__hmac`] = encryptPayload!.hm!
        putItem[`${attrName}__source`] = encryptPayload!.c!
      } else {
        putItem[attrName] = attrValue
      }

      return putItem
    },
    {} as Record<string, unknown>,
  )

  return encryptedItem
}

export async function makeSearchTerm(
  plaintext: string,
  protectColumn: ProtectColumn,
  protectTable: ProtectTable<ProtectTableColumn>,
) {
  const encryptResult = await protectClient.encrypt(plaintext, {
    column: protectColumn,
    table: protectTable,
  })

  if (encryptResult.failure) {
    throw new Error(`[protect]: ${encryptResult.failure.message}`)
  }

  const ciphertext = encryptResult.data

  if (!ciphertext) {
    throw new Error('expected ciphertext to be truthy')
  }

  if (!ciphertext.hm) {
    throw new Error('expected ciphertext.hm to be truthy')
  }

  return ciphertext.hm
}

export async function decryptModel<T extends Record<string, unknown>>(
  item: Record<string, unknown>,
  protectTable: ProtectTable<ProtectTableColumn>,
): Promise<T> {
  const encryptedAttrs = Object.keys(protectTable.build().columns)
  const ciphertextAttrSuffix = '__source'
  const searchTermAttrSuffix = '__hmac'

  // TODO: add a decrypt function that doesn't require the full EQL payload in PG's format.
  const withEqlPayloads = Object.entries(item).reduce(
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

  // TODO: `withEqlPayloads` shouldn't need to be `T` here because it doesn't actually match
  // the return type (encrypted fields are EQL payloads).
  const decryptResult = await protectClient.decryptModel<T>(
    withEqlPayloads as T,
  )

  if (decryptResult.failure) {
    throw new Error(`[protect]: ${decryptResult.failure.message}`)
  }

  return decryptResult.data!
}
