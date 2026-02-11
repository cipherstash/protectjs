import { Encryption, encryptedColumn, encryptedTable } from '@cipherstash/stack'

export const users = encryptedTable('users', {
  email: encryptedColumn('email').equality(),
})

export const protectClient = await Encryption({
  schemas: [users],
})
