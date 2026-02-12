import { PutCommand, ScanCommand } from '@aws-sdk/lib-dynamodb'
import { encryptedDynamoDB } from '@cipherstash/protect-dynamodb'
import pg from 'pg'
// Insert data in dynamo, scan it back out, insert/copy into PG, query from PG.
import { createTable, docClient, dynamoClient } from './common/dynamo'
import { encryptionClient, users } from './common/encryption'
import { log } from './common/log'
const PgClient = pg.Client

const tableName = 'UsersExportToPG'

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

  const dynamodb = encryptedDynamoDB({
    encryptionClient,
  })

  const user = {
    // `pk` won't be encrypted because it's not included in the `users` protected table schema.
    pk: 'user#1',
    // `email` will be encrypted because it's included in the `users` protected table schema.
    email: 'abc@example.com',
  }

  const encryptResult = await dynamodb.encryptModel(user, users)

  const putCommand = new PutCommand({
    TableName: tableName,
    Item: encryptResult,
  })

  await dynamoClient.send(putCommand)

  const scanCommand = new ScanCommand({
    TableName: tableName,
  })

  // This example uses a single scan for simplicity, but this could use streams, a paginated scans, etc.
  const scanResult = await docClient.send(scanCommand)

  log('scan items (encrypted)', scanResult.Items)

  const pgClient = new PgClient({
    port: 5433,
    database: 'cipherstash',
    user: 'cipherstash',
    password: 'password',
  })

  await pgClient.connect()

  await pgClient.query(`
    CREATE TABLE IF NOT EXISTS users (
      id INT PRIMARY KEY,
      email eql_v2_encrypted
    )
  `)

  try {
    await pgClient.query(
      "SELECT eql_v2.add_encrypted_constraint('users', 'email')",
    )
  } catch (err) {
    if (
      (err as Error).message !==
      'constraint "eql_v2_encrypted_check_email" for relation "users" already exists'
    ) {
      throw err
    }
  }

  if (!scanResult.Items) {
    throw new Error('No items found in scan result')
  }

  // TODO: this logic belongs in Encryption (or in common/encryption.ts for the prototype)
  const formattedForPgInsert = scanResult.Items.reduce(
    (recordsToInsert, currentItem) => {
      const idAsText = currentItem.pk.slice('user#'.length)

      const emailAsText = JSON.stringify({
        c: currentItem.email__source,
        bf: null,
        hm: currentItem.email__hmac,
        i: { c: 'email', t: 'users' },
        k: 'ct',
        ob: null,
        v: 2,
      })

      recordsToInsert[0].push(idAsText)
      recordsToInsert[1].push(emailAsText)

      return recordsToInsert
    },
    [[], []] as [string[], string[]],
  )

  const insertResult = await pgClient.query(
    `
      INSERT INTO users(id, email)
      SELECT * FROM UNNEST($1::int[], $2::jsonb[])
      ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email
      RETURNING id, email::jsonb
    `,
    [formattedForPgInsert[0], formattedForPgInsert[1]],
  )

  log('inserted rows', insertResult.rows)

  const decryptRowsResult = await encryptionClient.bulkDecryptModels<User>(
    insertResult.rows,
  )

  if (decryptRowsResult.failure) {
    throw new Error(decryptRowsResult.failure.message)
  }

  log('decrypted rows', decryptRowsResult.data)

  pgClient.end()
}

main()
