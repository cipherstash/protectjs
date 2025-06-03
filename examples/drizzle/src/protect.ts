import 'dotenv/config'
import {
  protect,
  csColumn,
  csTable,
  type ProtectClientConfig,
} from '@cipherstash/protect'

export const users = csTable('users', {
  email_encrypted: csColumn('email_encrypted')
    .equality()
    .orderAndRange()
    .freeTextSearch(),
})

const config: ProtectClientConfig = {
  schemas: [users],
}

export const protectClient = await protect(config)
