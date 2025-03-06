import 'dotenv/config'
import { protect, csColumn, csTable } from '@cipherstash/protect'

export const users = csTable('users', {
  email_encrypted: csColumn('email_encrypted')
    .equality()
    .orderAndRange()
    .freeTextSearch(),
})

export const protectClient = await protect(users)
