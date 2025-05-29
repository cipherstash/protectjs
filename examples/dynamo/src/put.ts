import { dynamoClient } from './common/dynamo-client'
import { protectClient, users } from './common/protect'
import type { EncryptedPayload, ProtectClient } from '@cipherstash/protect'
import { PutCommand } from '@aws-sdk/lib-dynamodb'
import type { ProtectTable, ProtectTableColumn } from '@cipherstash/protect'

async function encrypt(
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

async function main() {
  const user = {
    // `email` will be encrypted because it's included in the `users` protected table schema.
    email: 'abc@example.com',
    // `somePlaintextAttr` won't be encrypted because it's not in the protected table schema.
    somePlaintextAttr: 'abc',
  }

  const encryptResult = await encrypt(user, users)

  if (encryptResult.failure) {
    throw new Error(`encryption error: ${encryptResult.failure}`)
  }

  try {
    const putCommand = new PutCommand({
      TableName: 'Users',
      Item: encryptResult.data,
    })

    const data = await dynamoClient.send(putCommand)

    console.log(`result : ${JSON.stringify(data)}`)
  } catch (error) {
    console.error('Error:', error)
  }
}

main()
