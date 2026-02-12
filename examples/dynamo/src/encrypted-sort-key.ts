import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb'
import { encryptedDynamoDB } from '@cipherstash/protect-dynamodb'
import { createTable, docClient, dynamoClient } from './common/dynamo'
import { encryptionClient, users } from './common/encryption'
import { log } from './common/log'

const tableName = 'UsersEncryptedSortKey'

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
      {
        AttributeName: 'email__hmac',
        KeyType: 'RANGE',
      },
    ],
  })

  const dynamodb = encryptedDynamoDB({
    encryptionClient,
  })

  const user = {
    // `pk` won't be encrypted because it's not in the protected table schema.
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

  await docClient.send(putCommand)

  // Use encryptQuery to create the search term for sort key range query
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

  const getCommand = new GetCommand({
    TableName: tableName,
    Key: { pk: 'user#1', email__hmac: emailHmac },
  })

  const getResult = await docClient.send(getCommand)

  if (!getResult.Item) {
    throw new Error('Item not found')
  }

  const decryptedItem = await dynamodb.decryptModel<User>(getResult.Item, users)

  log('decrypted item', decryptedItem)
}

main()
