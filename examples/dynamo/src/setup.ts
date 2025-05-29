import { CreateTableCommand } from '@aws-sdk/client-dynamodb'
import { dynamoClient } from './common/dynamo-client'

const main = async () => {
  const command = new CreateTableCommand({
    TableName: 'Users',
    // For more information about data types,
    // see https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/HowItWorks.NamingRulesDataTypes.html#HowItWorks.DataTypes and
    // https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Programming.LowLevelAPI.html#Programming.LowLevelAPI.DataTypeDescriptors
    AttributeDefinitions: [
      {
        AttributeName: 'email__hm',
        AttributeType: 'S',
      },
    ],
    KeySchema: [
      {
        AttributeName: 'email__hm',
        KeyType: 'HASH',
      },
    ],
    ProvisionedThroughput: {
      ReadCapacityUnits: 5,
      WriteCapacityUnits: 5,
    },
  })

  const response = await dynamoClient.send(command)
  console.log(response)
}

main()
