import 'dotenv/config'
import { db } from './db'
import { users } from './db/schema'
import { protectClient } from './protect'
import { bindIfParam, sql } from 'drizzle-orm';
import type { BinaryOperator, SQL, SQLWrapper } from 'drizzle-orm';
import { parseArgs } from 'node:util'

const getEmail = () => {
  const { values, positionals } = parseArgs({
    args: process.argv,
    options: {
      email: {
        type: 'string',
      },
    },
    strict: true,
    allowPositionals: true,
  })

  return values.email
}

const email = getEmail()

if (!email) {
  throw new Error('Email is required')
}

const csEq: BinaryOperator = (left: SQLWrapper, right: unknown): SQL => {
	return sql`cs_unique_v1(${left}) = cs_unique_v1(${bindIfParam(right, left)})`;
};

// const csGt: BinaryOperator = (left: SQLWrapper, right: unknown): SQL => {
// 	return sql`cs_ore_64_8_v1(${left}) > cs_ore_64_8_v1(${bindIfParam(right, left)})`;
// };

// const csLt: BinaryOperator = (left: SQLWrapper, right: unknown): SQL => {
// 	return sql`cs_ore_64_8_v1(${left}) < cs_ore_64_8_v1(${bindIfParam(right, left)})`;
// };

// const csMatch: BinaryOperator = (left: SQLWrapper, right: unknown): SQL => {
// 	return sql`cs_match_v1(${left}) @> cs_match_v1(${bindIfParam(right, left)})`;
// };

const filterInput = await protectClient.encrypt(email, {
  column: 'email_encrypted',
  table: 'users',
})

if (filterInput.failure) {
  throw new Error(`[protect]: ${filterInput.failure.message}`)
}

const query = db
  .select({
    email: users.email_encrypted,
  })
  .from(users)
  .where(csEq(users.email_encrypted, filterInput.data))

const sqlResult = query.toSQL()
console.log('[INFO] SQL statement:', sqlResult)

const data = await query.execute()

const emails = await Promise.all(
  data.map(
    async (row) => await protectClient.decrypt(row.email as { c: string }),
  ),
)

console.log('[INFO] All emails have been decrypted by CipherStash Proxy')
console.log(emails)

process.exit(0)
