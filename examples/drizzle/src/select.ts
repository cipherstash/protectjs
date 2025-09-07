import 'dotenv/config'
import { db } from './db'
import { users } from './db/schema'
import { protectClient, users as protectUsers } from './protect'
import { bindIfParam, sql } from 'drizzle-orm'
import type { BinaryOperator, SQL, SQLWrapper } from 'drizzle-orm'
import { parseArgs } from 'node:util'
import type { EncryptedPayload } from '@cipherstash/protect'

const getArgs = () => {
  const { values, positionals } = parseArgs({
    args: process.argv,
    options: {
      filter: {
        type: 'string',
      },
      op: {
        type: 'string',
        default: 'match',
      },
    },
    strict: true,
    allowPositionals: true,
  })

  return values
}

const { filter, op } = getArgs()

if (!filter) {
  throw new Error('filter is required')
}

const fnForOp: (op: string) => BinaryOperator = (op) => {
  switch (op) {
    case 'match':
      return csMatch
    case 'eq':
      return csEq
    default:
      throw new Error(`unknown op: ${op}`)
  }
}

const csEq: BinaryOperator = (left: SQLWrapper, right: unknown): SQL => {
  return sql`cs_unique_v2(${left}) = cs_unique_v2(${bindIfParam(right, left)})`
}

const csGt: BinaryOperator = (left: SQLWrapper, right: unknown): SQL => {
  return sql`cs_ore_64_8_v2(${left}) > cs_ore_64_8_v2(${bindIfParam(right, left)})`
}

const csLt: BinaryOperator = (left: SQLWrapper, right: unknown): SQL => {
  return sql`cs_ore_64_8_v2(${left}) < cs_ore_64_8_v2(${bindIfParam(right, left)})`
}

const csMatch: BinaryOperator = (left: SQLWrapper, right: unknown): SQL => {
  return sql`cs_match_v2(${left}) @> cs_match_v2(${bindIfParam(right, left)})`
}

const filterInput = await protectClient.encrypt(filter, {
  column: protectUsers.email_encrypted,
  table: protectUsers,
})

if (filterInput.failure) {
  throw new Error(`[protect]: ${filterInput.failure.message}`)
}

const filterFn = fnForOp(op)

const query = db
  .select({
    email: users.email_encrypted,
  })
  .from(users)
  .where(filterFn(users.email_encrypted, filterInput.data))
  .orderBy(sql`cs_ore_64_8_v2(users.email_encrypted)`)

const sqlResult = query.toSQL()
console.log('[INFO] SQL statement:', sqlResult)

const data = await query.execute()

const emails = await Promise.all(
  data.map(
    async (row) => await protectClient.decrypt(row.email as EncryptedPayload),
  ),
)

console.log('[INFO] All emails have been decrypted by CipherStash Proxy')
console.log(emails)

process.exit(0)
