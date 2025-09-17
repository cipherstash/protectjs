import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb'
import { protectDynamoDB } from '@cipherstash/protect-dynamodb'
import { createTable, docClient, dynamoClient } from './common/dynamo'
import { log } from './common/log'
import { protectClient, users } from './common/protect'

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

  const protectDynamo = protectDynamoDB({
    protectClient,
  })

  const user = {
    // `pk` won't be encrypted because it's not in the protected table schema.
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

  await docClient.send(putCommand)

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

  const getCommand = new GetCommand({
    TableName: tableName,
    Key: { pk: 'user#1', email__hmac: emailHmac },
  })

  const getResult = await docClient.send(getCommand)

  if (!getResult.Item) {
    throw new Error('Item not found')
  }

  const decryptedItem = await protectDynamo.decryptModel<User>(
    getResult.Item,
    users,
  )

  log('decrypted item', decryptedItem)
}

main()
