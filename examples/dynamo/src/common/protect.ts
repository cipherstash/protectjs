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
): Promise<ReturnType<ProtectClient['encryptModel']>> {
  const encryptResult = await protectClient.encryptModel(item, protectTable)

  if (encryptResult.failure) {
    return encryptResult
  }

  const data = encryptResult.data

  const encryptedAttrs = Object.keys(protectTable.build().columns)

  const encryptedItem = Object.entries(data).reduce(
    (put_items, [attr_name, attr_value]) => {
      if (encryptedAttrs.includes(attr_name)) {
        const encryptPayload = attr_value as EncryptedPayload

        put_items[`${attr_name}__hm`] = encryptPayload!.hm!
        put_items[`${attr_name}__c`] = encryptPayload!.c!
      } else {
        put_items[attr_name] = attr_value
      }

      return put_items
    },
    {} as Record<string, unknown>,
  )

  return { data: encryptedItem }
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
