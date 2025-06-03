import { protect, type ProtectClientConfig } from '@cipherstash/protect'
import { users } from './schema'

const config: ProtectClientConfig = {
  schemas: [users],
}

export const protectClient = await protect(config)
