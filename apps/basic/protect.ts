import 'dotenv/config'
import { protect, csColumn, csTable } from '@cipherstash/protect'

export const users = csTable('users', {
  name: csColumn('name'),
})

export const protectClient = await protect(users)
