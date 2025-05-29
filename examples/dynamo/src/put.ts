import { dynamoClient } from './common/dynamo-client'
import { users, encryptModel } from './common/protect'
import { PutCommand } from '@aws-sdk/lib-dynamodb'

async function main() {
  const user = {
    // `email` will be encrypted because it's included in the `users` protected table schema.
    email: 'abc@example.com',
    // `somePlaintextAttr` won't be encrypted because it's not in the protected table schema.
    somePlaintextAttr: 'abc',
  }

  const encryptResult = await encryptModel(user, users)

  if (encryptResult.failure) {
    throw new Error(`encryption error: ${encryptResult.failure}`)
  }

  try {
    const putCommand = new PutCommand({
      TableName: 'Users',
      Item: encryptResult.data,
    })

    const data = await dynamoClient.send(putCommand)

    console.log(`result : ${JSON.stringify(data)}`)
  } catch (error) {
    console.error('Error:', error)
  }
}

main()
