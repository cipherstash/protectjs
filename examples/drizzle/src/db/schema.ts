import 'dotenv/config'
import { encryptedType } from '@cipherstash/drizzle/pg'
import { pgTable, serial, timestamp, varchar } from 'drizzle-orm/pg-core'

export const transactions = pgTable('transactions', {
  id: serial('id').primaryKey(),
  // Encrypted sensitive fields
  accountNumber: encryptedType<string>('account_number', {
    freeTextSearch: true,
    equality: true,
  }),
  amount: encryptedType<number>('amount', {
    dataType: 'number',
    equality: true,
    orderAndRange: true,
  }),
  description: encryptedType<string>('description', {
    freeTextSearch: true,
  }),
  // Non-sensitive fields
  transactionType: varchar('transaction_type', { length: 50 }).notNull(),
  status: varchar('status', { length: 20 }).notNull().default('pending'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})
