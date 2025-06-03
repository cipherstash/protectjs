import { csColumn, csTable } from '@cipherstash/protect'

export const users = csTable('users', {
  email: csColumn('email'),
  name: csColumn('name'),
})
