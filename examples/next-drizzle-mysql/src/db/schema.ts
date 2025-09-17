import { int, json, mysqlTable, uniqueIndex } from 'drizzle-orm/mysql-core'

export const users = mysqlTable('users', {
  id: int().primaryKey().autoincrement(),
  name: json(),
  email: json(),
})
