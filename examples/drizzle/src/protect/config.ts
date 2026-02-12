import 'dotenv/config'
import {
  createEncryptionOperators,
  extractProtectSchema,
} from '@cipherstash/drizzle/pg'
import { Encryption } from '@cipherstash/stack'
import { transactions } from '../db/schema'

// Extract Stash Encryption schema from Drizzle table
export const transactionsSchema = extractProtectSchema(transactions)

// Initialize Stash Encryption client
export const encryptionClient = await Encryption({
  schemas: [transactionsSchema],
})

// Create encryption operators for encrypted field queries
export const encryptionOps = createEncryptionOperators(encryptionClient)
