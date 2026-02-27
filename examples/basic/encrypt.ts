import 'dotenv/config'
import { Encryption, encryptedColumn, encryptedTable } from '@cipherstash/stack'

export const users = encryptedTable('users', {
  name: encryptedColumn('name'),
})

export const client = await Encryption({
  schemas: [users],
})
