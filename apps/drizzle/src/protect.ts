import 'dotenv/config'
import { protect, type EncryptConfig } from '@cipherstash/protect'

const config: EncryptConfig = {
  v: 1,
  tables: {
    users: {
      email_encrypted: {
        cast_as: 'text',
        indexes: {
          ore: {},
          match: {
            tokenizer: {
              kind: 'ngram',
              token_length: 3
            },
            token_filters: [
              {
                kind: 'downcase'
              }
            ],
            k: 6,
            m: 2048
          },
          unique: {} },
      },
    },
  },
}

export const protectClient = await protect(config)
