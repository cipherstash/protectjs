import { dynamoClient, docClient, createTable } from './common/dynamo'
import { log } from './common/log'
import { users, encryptModel, decryptModel } from './common/protect'
import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb'

const tableName = 'UsersSimple'

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

  const getCommand = new GetCommand({
    TableName: tableName,
    Key: { pk: 'user#1' },
  })

  const getResult = await docClient.send(getCommand)

  const decryptedItem = await decryptModel<User>(getResult.Item!, users)

  log('decrypted item', decryptedItem)
}

main()
