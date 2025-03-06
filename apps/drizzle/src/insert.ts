import 'dotenv/config'
import { parseArgs } from 'node:util'
import { db } from './db'
import { users } from './db/schema'
import { protectClient, users as protectUsers } from './protect'

const getEmail = () => {
  const { values, positionals } = parseArgs({
    args: process.argv,
    options: {
      email: {
        type: 'string',
      },
    },
    strict: true,
    allowPositionals: true,
  })

  return values.email
}

const email = getEmail()

if (!email) {
  throw new Error('Email is required')
}

const encryptedResult = await protectClient.encrypt(email, {
  column: protectUsers.email_encrypted,
  table: protectUsers,
})

if (encryptedResult.failure) {
  throw new Error(`[protect]: ${encryptedResult.failure.message}`)
}

const encryptedEmail = encryptedResult.data

const sql = db.insert(users).values({
  email: email,
  email_encrypted: encryptedEmail,
})

const sqlResult = sql.toSQL()
console.log('[INFO] SQL statement:', sqlResult)

await sql.execute()
console.log(
  "[INFO] You've inserted a new user with an encrypted email from the plaintext",
  email,
)

process.exit(0)
