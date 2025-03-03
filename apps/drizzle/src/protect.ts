import 'dotenv/config'
import { protect, type EncryptConfig } from '@cipherstash/protect'

const config: EncryptConfig = {
  v: 1,
  tables: {
    users: {
      email_encrypted: {
        cast_as: 'text',
        indexes: { ore: {}, match: {}, unique: {} },
      },
    },
  },
}

export const protectClient = await protect(config)
