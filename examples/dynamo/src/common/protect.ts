import { csColumn, csTable, protect } from '@cipherstash/protect'

export const users = csTable('users', {
  email: csColumn('email').equality(),
})

export const protectClient = await protect({
  schemas: [users],
})
