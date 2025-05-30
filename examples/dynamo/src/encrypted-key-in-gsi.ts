import { dynamoClient, docClient, createTable } from './common/dynamo'
import { log } from './common/log'
import {
  users,
  encryptModel,
  decryptModel,
  makeSearchTerm,
} from './common/protect'
import { PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb'

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
        AttributeName: 'email__hm',
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
        KeySchema: [{ AttributeName: 'email__hm', KeyType: 'HASH' }],
        Projection: {
          ProjectionType: 'INCLUDE',
          NonKeyAttributes: ['email__c'],
        },
        ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 },
      },
    ],
  })

  const user = {
    // `pk` won't be encrypted because it's not included in the `users` protected table schema.
    pk: 'user#1',
    // `email` will be encrypted because it's included in the `users` protected table schema.
    email: 'abc@example.com',
  }

  const encryptResult = await encryptModel(user, users)

  log('encrypted item', encryptResult)

  const putCommand = new PutCommand({
    TableName: tableName,
    Item: encryptResult,
  })

  await dynamoClient.send(putCommand)

  const searchTerm = await makeSearchTerm('abc@example.com', users.email, users)

  const queryCommand = new QueryCommand({
    TableName: tableName,
    IndexName: indexName,
    KeyConditionExpression: 'email__hm = :e',
    ExpressionAttributeValues: {
      ':e': searchTerm,
    },
    Limit: 1,
  })

  const queryResult = await docClient.send(queryCommand)

  const decryptedItem = await decryptModel<User>(queryResult.Items![0], users)

  log('decrypted item', decryptedItem)
}

main()
