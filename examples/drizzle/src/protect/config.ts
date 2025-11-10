import 'dotenv/config'
import {
  createProtectOperators,
  extractProtectSchema,
} from '@cipherstash/drizzle/pg'
import { protect } from '@cipherstash/protect'
import { transactions } from '../db/schema'

type ProtectSchema = Parameters<typeof protect>[0]['schemas'][number]

// Extract Protect.js schema from Drizzle table
export const transactionsSchema = extractProtectSchema(
  transactions,
) as unknown as ProtectSchema

// Initialize Protect.js client
export const protectClient = await protect({
  schemas: [transactionsSchema],
})

// Create Protect operators for encrypted field queries
export const protectOps = createProtectOperators(
  protectClient as unknown as Parameters<typeof createProtectOperators>[0],
)
