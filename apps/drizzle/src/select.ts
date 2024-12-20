import 'dotenv/config'
import { db } from './db'
import { users } from './db/schema'
import { eqlClient } from './eql'

const sql = db
  .select({
    email: users.email_encrypted,
  })
  .from(users)

const sqlResult = sql.toSQL()
console.log('[INFO] SQL statement:', sqlResult)

const data = await sql.execute()

const emails = await Promise.all(
  data.map(async (row) => await eqlClient.decrypt(row.email as { c: string })),
)

console.log('[INFO] All emails have been decrypted by CipherStash Proxy')
console.log(emails)

process.exit(0)
