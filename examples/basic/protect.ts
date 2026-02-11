import 'dotenv/config'
import {
  type EncryptionClientConfig,
  encryptedColumn,
  encryptedTable,
  Encryption,
} from '@cipherstash/stack'

export const users = encryptedTable('users', {
  name: encryptedColumn('name'),
})

const config: EncryptionClientConfig = {
  schemas: [users],
}

export const protectClient = await Encryption(config)
