import { mysqlTable, int, json, uniqueIndex } from 'drizzle-orm/mysql-core'

export const users = mysqlTable('users', {
  id: int().primaryKey().autoincrement(),
  name: json(),
  email: json(),
})
