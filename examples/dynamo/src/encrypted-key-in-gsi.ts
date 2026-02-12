import { PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb'
import { encryptedDynamoDB } from '@cipherstash/protect-dynamodb'
import { createTable, docClient, dynamoClient } from './common/dynamo'
import { log } from './common/log'
import { encryptionClient, users } from './common/protect'

const tableName = 'UsersEncryptedKeyInGSI'
const indexName = 'EmailIndex'

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
      {
        AttributeName: 'email__hmac',
        AttributeType: 'S',
      },
    ],
    KeySchema: [
      {
        AttributeName: 'pk',
        KeyType: 'HASH',
      },
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: indexName,
        KeySchema: [{ AttributeName: 'email__hmac', KeyType: 'HASH' }],
        Projection: {
          ProjectionType: 'INCLUDE',
          NonKeyAttributes: ['email__source'],
        },
        ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 },
      },
    ],
  })

  const dynamodb = encryptedDynamoDB({
    encryptionClient,
  })

  const user = {
    // `pk` won't be encrypted because it's not included in the `users` protected table schema.
    pk: 'user#1',
    // `email` will be encrypted because it's included in the `users` protected table schema.
    email: 'abc@example.com',
  }

  const encryptResult = await dynamodb.encryptModel(user, users)

  log('encrypted item', encryptResult)

  const putCommand = new PutCommand({
    TableName: tableName,
    Item: encryptResult,
  })

  await dynamoClient.send(putCommand)

  // Use encryptQuery to create the search term for GSI query
  const encryptedResult = await encryptionClient.encryptQuery([
    {
      value: 'abc@example.com',
      column: users.email,
      table: users,
      queryType: 'equality',
    },
  ])

  if (encryptedResult.failure) {
    throw new Error(
      `Failed to encrypt query: ${encryptedResult.failure.message}`,
    )
  }

  // Extract the HMAC for DynamoDB key lookup
  const encryptedEmail = encryptedResult.data[0]
  if (!encryptedEmail) {
    throw new Error('Failed to encrypt query: no result returned')
  }
  const emailHmac = encryptedEmail.hm

  const queryCommand = new QueryCommand({
    TableName: tableName,
    IndexName: indexName,
    KeyConditionExpression: 'email__hmac = :e',
    ExpressionAttributeValues: {
      ':e': emailHmac,
    },
    Limit: 1,
  })

  const queryResult = await docClient.send(queryCommand)

  if (!queryResult.Items?.[0]) {
    throw new Error('Item not found')
  }

  const decryptedItem = await dynamodb.decryptModel<User>(
    queryResult.Items[0],
    users,
  )

  log('decrypted item', decryptedItem)
}

main()
