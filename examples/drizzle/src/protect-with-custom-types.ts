import 'dotenv/config'
import {
  protect,
  csTable,
  type ProtectClientConfig,
} from '@cipherstash/protect'
import { users } from './db/schema'
import { extractCsColumn } from './db/cs-types'

// Create CipherStash schema using the underlying csColumns from our custom types
const emailCsColumn = extractCsColumn(users.email_encrypted)
if (!emailCsColumn) {
  throw new Error('Failed to extract csColumn from email_encrypted')
}

export const protectUsers = csTable('users', {
  email_encrypted: emailCsColumn.equality().orderAndRange().freeTextSearch(),
})

const config: ProtectClientConfig = {
  schemas: [protectUsers],
}

export const protectClient = await protect(config)

// Example usage:
// const encryptedResult = await protectClient.encryptModel({
//   email_encrypted: 'user@example.com'
// }, protectUsers)
