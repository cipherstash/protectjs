import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb'
import { encryptedDynamoDB } from '@cipherstash/protect-dynamodb'
import { createTable, docClient } from './common/dynamo'
import { encryptionClient, users } from './common/encryption'
import { log } from './common/log'

const tableName = 'UsersEncryptedPartitionKey'

type User = {
  email: string
}

const main = async () => {
  await createTable({
    TableName: tableName,
    AttributeDefinitions: [
      {
        AttributeName: 'email__hmac',
        AttributeType: 'S',
      },
    ],
    KeySchema: [
      {
        AttributeName: 'email__hmac',
        KeyType: 'HASH',
      },
    ],
  })

  const dynamodb = encryptedDynamoDB({
    encryptionClient,
  })

  const user = {
    // `email` will be encrypted because it's included in the `users` encrypted table schema.
    email: 'abc@example.com',
    // `somePlaintextAttr` won't be encrypted because it's not in the encrypted table schema.
    somePlaintextAttr: 'abc',
  }

  const encryptResult = await dynamodb.encryptModel(user, users)

  log('encrypted item', encryptResult)

  const putCommand = new PutCommand({
    TableName: tableName,
    Item: encryptResult,
  })

  await docClient.send(putCommand)

  // Use encryptQuery to create the search term for partition key lookup
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
    Key: { email__hmac: emailHmac },
  })

  const getResult = await docClient.send(getCommand)

  const decryptedItem = await dynamodb.decryptModel<User>(getResult.Item, users)

  log('decrypted item', decryptedItem)
}

main()
