import 'dotenv/config'
import {
  Encryption,
  type EncryptionClientConfig,
  encryptedColumn,
  encryptedTable,
} from '@cipherstash/stack'

export const users = encryptedTable('users', {
  name: encryptedColumn('name'),
})

const config: EncryptionClientConfig = {
  schemas: [users],
}

export const encryptionClient = await Encryption(config)
