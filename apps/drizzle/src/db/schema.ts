import 'dotenv/config'
import {
  customType,
  jsonb,
  pgTable,
  serial,
  varchar,
} from 'drizzle-orm/pg-core'

// Custom types will be implemented in the future - this is an example for now
// ---
// const cs_encrypted_v2 = <TData>(name: string) =>
//   customType<{ data: TData; driverData: string }>({
//     dataType() {
//       return 'cs_encrypted_v2'
//     },
//     toDriver(value: TData): string {
//       return JSON.stringify(value)
//     },
//   })(name)

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: varchar('email').unique(),
  email_encrypted: jsonb('email_encrypted').notNull(),
})
