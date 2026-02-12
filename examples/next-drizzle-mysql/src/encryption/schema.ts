import { encryptedColumn, encryptedTable } from '@cipherstash/stack'

export const users = encryptedTable('users', {
  email: encryptedColumn('email'),
  name: encryptedColumn('name'),
})
