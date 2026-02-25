import 'dotenv/config'
import {
  Encryption,
  encryptedTable,
  encryptedColumn,
} from '@cipherstash/stack'

export const users = encryptedTable('users', {
  name: encryptedColumn('name'),
})

export const client = await Encryption({
  schemas: [users],
})
