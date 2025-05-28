import { GetItemCommand } from '@aws-sdk/client-dynamodb'
import { unmarshall } from '@aws-sdk/util-dynamodb'
import { dynamoClient } from './common/dynamo-client'
import { protectClient, users } from './common/protect'

async function main() {
  const encryptResult = await protectClient.encrypt('abc@example.com', {
    column: users.email,
    table: users,
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

  const params = {
    Key: {
      Email__hm: {
        S: ciphertext.hm,
      },
    },
    TableName: 'Users',
  }

  try {
    const data = await dynamoClient.send(new GetItemCommand(params))

    if (!data.Item) {
      throw new Error('expected data.Item to be truthy')
    }

    const item = unmarshall(data.Item)

    const decryptResult = await protectClient.decrypt({
      c: item.Email__c as string,
      bf: null,
      hm: null,
      i: { c: 'email', t: 'users' },
      k: 'kind',
      ob: null,
      v: 2,
    })

    if (decryptResult.failure) {
      throw new Error(`[protect]: ${decryptResult.failure.message}`)
    }

    const plaintext = decryptResult.data

    console.log('Decrypting the ciphertext...')
    console.log('The plaintext is:', plaintext)
  } catch (error) {
    console.error('Error:', error)
  }
}

main()
