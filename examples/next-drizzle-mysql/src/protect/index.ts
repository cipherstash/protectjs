import { protect } from '@cipherstash/protect'
import { users } from './schema'

export const protectClient = await protect(users)
