import { PutItemCommand } from '@aws-sdk/client-dynamodb'
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

  if (!ciphertext.c) {
    throw new Error('expected ciphertext.c to be truthy')
  }

  const params = {
    TableName: 'Users',
    Item: {
      Email__hm: { S: ciphertext.hm },
      Email__c: { S: ciphertext.c },
    },
  }

  try {
    const data = await dynamoClient.send(new PutItemCommand(params))
    console.log(`result : ${JSON.stringify(data)}`)
  } catch (error) {
    console.error('Error:', error)
  }
}

main()
