import { CreateTableCommand } from '@aws-sdk/client-dynamodb'
import { dynamoClient } from './common/dynamo-client'
import { users, encryptModel, makeSearchTerm } from './common/protect'
import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb'

const tableName = 'UsersSimple'

const main = async () => {
  const command = new CreateTableCommand({
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
    ProvisionedThroughput: {
      ReadCapacityUnits: 5,
      WriteCapacityUnits: 5,
    },
  })

  try {
    const response = await dynamoClient.send(command)
  } catch (err) {
    if (err?.name! !== 'ResourceInUseException') {
      throw err
    }
  }

  const user = {
    // `pk` won't be encrypted because it's not included in the `users` protected table schema.
    pk: 'user#1',
    // `email` will be encrypted because it's included in the `users` protected table schema.
    email: 'abc@example.com',
  }

  const encryptResult = await encryptModel(user, users)

  if (encryptResult.failure) {
    throw new Error(`encryption error: ${encryptResult.failure}`)
  }

  console.log(encryptResult.data)

  const putCommand = new PutCommand({
    TableName: tableName,
    Item: encryptResult.data,
  })

  await dynamoClient.send(putCommand)

  const searchTerm = await makeSearchTerm('abc@example.com', users.email, users)

  const getCommand = new GetCommand({
    TableName: tableName,
    Key: { pk: 'user#1' },
  })

  const getResult = await dynamoClient.send(getCommand)

  console.log(JSON.stringify(getResult.Item))

  // TODO: decrypt
}

main()
