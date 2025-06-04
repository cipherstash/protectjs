import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb'
import { createTable, docClient } from './common/dynamo'
import {
  decryptModel,
  encryptModel,
  makeSearchTerm,
  users,
} from './common/protect'
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

  const user = {
    // `email` will be encrypted because it's included in the `users` protected table schema.
    email: 'abc@example.com',
    // `somePlaintextAttr` won't be encrypted because it's not in the protected table schema.
    somePlaintextAttr: 'abc',
  }

  const encryptResult = await encryptModel(user, users)

  log('encrypted item', encryptResult)

  const putCommand = new PutCommand({
    TableName: tableName,
    Item: encryptResult,
  })

  await docClient.send(putCommand)

  const searchTerm = await makeSearchTerm('abc@example.com', users.email, users)

  const getCommand = new GetCommand({
    TableName: tableName,
    Key: { email__hmac: searchTerm },
  })

  const getResult = await docClient.send(getCommand)

  const decryptedItem = await decryptModel<User>(getResult.Item, users)

  log('decrypted item', decryptedItem)
}

main()
