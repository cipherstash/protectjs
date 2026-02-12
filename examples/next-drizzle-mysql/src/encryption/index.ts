import { Encryption, type EncryptionClientConfig } from '@cipherstash/stack'
import { users } from './schema'

const config: EncryptionClientConfig = {
  schemas: [users],
}

export const encryptionClient = await Encryption(config)
