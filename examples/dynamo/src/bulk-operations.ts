import { dynamoClient, docClient, createTable } from './common/dynamo'
import { log } from './common/log'
import { users, protectClient } from './common/protect'
import { BatchGetCommand, BatchWriteCommand } from '@aws-sdk/lib-dynamodb'
import { protectDynamoDB } from '@cipherstash/protect-dynamodb'

const tableName = 'UsersBulkOperations'

type User = {
  pk: string
  email: string
}

const main = async () => {
  await createTable({
    TableName: tableName,
    AttributeDefinitions: [
      {
        AttributeName: 'pk',
        AttributeType: 'S',
      },
    ],
    KeySchema: [
      {
        AttributeName: 'pk',
        KeyType: 'HASH',
      },
    ],
  })

  const protectDynamo = protectDynamoDB({
    protectClient,
  })

  const items = [
    {
      // `pk` won't be encrypted because it's not included in the `users` protected table schema.
      pk: 'user#1',
      // `email` will be encrypted because it's included in the `users` protected table schema.
      email: 'abc@example.com',
    },
    {
      pk: 'user#2',
      email: 'def@example.com',
    },
  ]

  const encryptResult = await protectDynamo.bulkEncryptModels(items, users)

  if (encryptResult.failure) {
    throw new Error(`Failed to encrypt items: ${encryptResult.failure.message}`)
  }

  const putRequests = encryptResult.data.map(
    (item: Record<string, unknown>) => ({
      PutRequest: {
        Item: item,
      },
    }),
  )

  log('encrypted items', encryptResult)

  const batchWriteCommand = new BatchWriteCommand({
    RequestItems: {
      [tableName]: putRequests,
    },
  })

  await dynamoClient.send(batchWriteCommand)

  const batchGetCommand = new BatchGetCommand({
    RequestItems: {
      [tableName]: {
        Keys: [{ pk: 'user#1' }, { pk: 'user#2' }],
      },
    },
  })

  const getResult = await docClient.send(batchGetCommand)

  const decryptedItems = await protectDynamo.bulkDecryptModels<User>(
    getResult.Responses?.[tableName],
    users,
  )

  log('decrypted items', decryptedItems)
}

main()
