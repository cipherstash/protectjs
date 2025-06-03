import {
  CreateTableCommand,
  DynamoDBClient,
  type CreateTableCommandInput,
} from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'

export const dynamoClient = new DynamoDBClient({
  credentials: {
    accessKeyId: 'fakeAccessKeyId',
    secretAccessKey: 'fakeSecretAccessKey',
  },
  endpoint: 'http://localhost:8000',
})

export const docClient = DynamoDBDocumentClient.from(dynamoClient)

// Creates a table with provisioned throughput set to 5 RCU and 5 WCU.
// Ignores `ResourceInUseException`s if the table already exists.
export async function createTable(
  input: Omit<CreateTableCommandInput, 'ProvisionedThroughPut'>,
) {
  const command = new CreateTableCommand({
    ProvisionedThroughput: {
      ReadCapacityUnits: 5,
      WriteCapacityUnits: 5,
    },
    ...input,
  })

  try {
    await docClient.send(command)
  } catch (err) {
    if (err?.name! !== 'ResourceInUseException') {
      throw err
    }
  }
}
