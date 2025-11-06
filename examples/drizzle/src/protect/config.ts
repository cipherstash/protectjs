import 'dotenv/config'
import {
  createProtectOperators,
  extractProtectSchema,
} from '@cipherstash/drizzle/pg'
import { protect } from '@cipherstash/protect'
import { transactions } from '../db/schema'

// Extract Protect.js schema from Drizzle table
export const transactionsSchema = extractProtectSchema(transactions)

// Initialize Protect.js client
export const protectClient = await protect({
  schemas: [transactionsSchema],
})

// Create Protect operators for encrypted field queries
export const protectOps = createProtectOperators(protectClient)
