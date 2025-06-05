import { dynamoClient, docClient, createTable } from './common/dynamo'
import { log } from './common/log'
import { users, protectClient } from './common/protect'
import { PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb'
import { protectDynamoDB } from '@cipherstash/protect-dynamodb'

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

  const protectDynamo = protectDynamoDB({
    protectClient,
  })

  const user = {
    // `pk` won't be encrypted because it's not included in the `users` protected table schema.
    pk: 'user#1',
    // `email` will be encrypted because it's included in the `users` protected table schema.
    email: 'abc@example.com',
  }

  const encryptResult = await protectDynamo.encryptModel(user, users)

  log('encrypted item', encryptResult)

  const putCommand = new PutCommand({
    TableName: tableName,
    Item: encryptResult,
  })

  await dynamoClient.send(putCommand)

  const searchTermsResult = await protectDynamo.createSearchTerms([
    {
      value: 'abc@example.com',
      column: users.email,
      table: users,
    },
  ])

  if (searchTermsResult.failure) {
    throw new Error(
      `Failed to create search terms: ${searchTermsResult.failure.message}`,
    )
  }

  const [emailHmac] = searchTermsResult.data

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

  const decryptedItem = await protectDynamo.decryptModel<User>(
    queryResult.Items[0],
    users,
  )

  log('decrypted item', decryptedItem)
}

main()
