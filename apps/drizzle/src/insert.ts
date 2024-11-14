import { getEmailArg } from '@cipherstash/utils'
import { createEqlPayload } from '@cipherstash/jseql'
import { db } from './db'
import { users } from './schema'

const email = getEmailArg({
  required: true,
})

const sql = db.insert(users).values({
  email: email,
  email_encrypted: createEqlPayload({
    plaintext: email,
    table: 'users',
    column: 'email_encrypted',
  }),
})

const sqlResult = sql.toSQL()
console.log('[INFO] SQL statement:', sqlResult)

await sql.execute()
console.log(
  "[INFO] You've inserted a new user with an encrypted email from the plaintext",
  email,
)

process.exit(0)
