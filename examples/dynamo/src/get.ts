import { docClient } from './common/dynamo'
import { users, decryptModel, makeSearchTerm } from './common/protect'
import { GetCommand } from '@aws-sdk/lib-dynamodb'

type User = {
  email: string
}

async function main() {
  const searchTerm = await makeSearchTerm('abc@example.com', users.email, users)

  const getCommand = new GetCommand({
    TableName: 'Users',
    Key: { email__hm: searchTerm },
  })

  const getResult = await docClient.send(getCommand)

  const decryptedItem = await decryptModel<User>(getResult.Item!, users)

  console.log(`\ndecrypted item:\n${JSON.stringify(decryptedItem, null, 2)}`)
}

main()
