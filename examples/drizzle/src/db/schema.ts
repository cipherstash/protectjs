import 'dotenv/config'
import { pgTable, serial, varchar } from 'drizzle-orm/pg-core'
import { createCsEncryptedColumn, extractCsColumn } from './cs-types'

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: varchar('email').unique(),
  email_encrypted: createCsEncryptedColumn<string>('email_encrypted', {
    equality: true,
  }),
})

// Example of how to use the custom type with CipherStash protect system
// You can access the underlying csColumn for configuration:
// const emailColumn = extractCsColumn(users.email_encrypted)
// if (emailColumn) {
//   emailColumn.equality().orderAndRange().freeTextSearch()
// }

const a = extractCsColumn(users.email_encrypted)
