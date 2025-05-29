import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'

export const dynamoClient = new DynamoDBClient({
  credentials: {
    accessKeyId: 'fakeAccessKeyId',
    secretAccessKey: 'fakeSecretAccessKey',
  },
  endpoint: 'http://localhost:8000',
})

export const docClient = DynamoDBDocumentClient.from(dynamoClient)
