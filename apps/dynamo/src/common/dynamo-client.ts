import { DynamoDBClient } from '@aws-sdk/client-dynamodb'

export const dynamoClient = new DynamoDBClient({
  credentials: {
    accessKeyId: 'fakeAccessKeyId',
    secretAccessKey: 'fakeSecretAccessKey',
  },
  endpoint: 'http://localhost:8000',
})
