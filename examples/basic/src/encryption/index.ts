import { encryptedTable, encryptedColumn } from '@cipherstash/stack/schema'
import { Encryption } from '@cipherstash/stack'

export const usersTable = encryptedTable('users', {
  email: encryptedColumn('email')
    .equality()
    .orderAndRange()
    .freeTextSearch(),
})

export const encryptionClient = await Encryption({
  schemas: [usersTable],
})
