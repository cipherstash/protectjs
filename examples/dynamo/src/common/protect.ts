import { protect, csColumn, csTable } from '@cipherstash/protect'

export const users = csTable('users', {
  email: csColumn('email').equality(),
})

export const protectClient = await protect({
  schemas: [users],
})
