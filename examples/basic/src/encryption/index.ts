import { pgTable, integer, timestamp } from 'drizzle-orm/pg-core'
import { encryptedType, extractEncryptionSchema } from '@cipherstash/stack/drizzle'
import { Encryption } from '@cipherstash/stack'

export const usersTable = pgTable('users', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  email: encryptedType<string>('email', {
    equality: true,
    freeTextSearch: true,
  }),
  name: encryptedType<string>('name', {
    equality: true,
    freeTextSearch: true,
  }),
  createdAt: timestamp('created_at').defaultNow(),
})

const usersSchema = extractEncryptionSchema(usersTable)

export const encryptionClient = await Encryption({
  schemas: [usersSchema],
})
