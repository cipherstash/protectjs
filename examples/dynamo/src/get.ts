import { GetItemCommand } from '@aws-sdk/client-dynamodb'
import { unmarshall } from '@aws-sdk/util-dynamodb'
import { dynamoClient } from './common/dynamo-client'
import { protectClient, users } from './common/protect'

async function main() {
  // TODO: maybe extract `searchTermEq('term', attrSchema)`? Or `searchKey`.
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
      email__hm: {
        S: ciphertext.hm,
      },
    },
    TableName: 'Users',
  }

  try {
    // TODO: use higher level API? Check example code and match that.
    const data = await dynamoClient.send(new GetItemCommand(params))

    if (!data.Item) {
      throw new Error('expected data.Item to be truthy')
    }

    const item = unmarshall(data.Item)

    // TODO: prob use ffi-decrypt here since we don't want the full payload
    const decryptResult = await protectClient.decrypt({
      c: item.email__c as string,
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
