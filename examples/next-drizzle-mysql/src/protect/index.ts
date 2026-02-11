import { type EncryptionClientConfig, Encryption } from '@cipherstash/stack'
import { users } from './schema'

const config: EncryptionClientConfig = {
  schemas: [users],
}

export const protectClient = await Encryption(config)
