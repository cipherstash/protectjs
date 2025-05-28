import { pgTable, serial, jsonb, varchar } from 'drizzle-orm/pg-core'

// Data that is encrypted using protectjs is stored as jsonb in postgres
// ---
// This example does not include any searchable encrypted fields
// If you want to search on encrypted fields, you will need to install EQL.
// The EQL library ships with custom types that are used to define encrypted fields.
// See https://github.com/cipherstash/encrypted-query-language
// ---

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  name: varchar('name').notNull(),
  email: jsonb('email').notNull(),
  role: varchar('role').notNull(),
})
