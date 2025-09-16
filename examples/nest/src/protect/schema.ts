import { csTable, csColumn } from '@cipherstash/protect'

export const users = csTable('users', {
  email_encrypted: csColumn('email_encrypted'),
})
