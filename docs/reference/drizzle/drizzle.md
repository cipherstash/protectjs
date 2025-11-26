# Drizzle + Protect.js Interactive Examples
## Protect Operators Pattern (Recommended)

This page demonstrates how to perform queries on encrypted data using **Drizzle ORM** with **CipherStash Protect.js** using the **protect operators pattern**.

**Pattern:** Auto-encrypting operators from `createProtectOperators()` provide clean syntax with automatic encryption.

**How it works:**
- Use `await protect.eq()`, `await protect.gte()`, `await protect.like()` for queries
- Operators automatically detect encrypted columns and encrypt query values
- Results are automatically decrypted by the executor

## Overview

This example uses a `transactions` table with the following encrypted fields:

- **`account`**: Encrypted with equality search support
- **`amount`**: Encrypted with range query support (greater than, less than)
- **`description`**: Encrypted with full-text search support
- **`createdAt`**: Encrypted timestamp with range query support

All encrypted fields are automatically decrypted when queried, while remaining encrypted at rest in the database.

**Schema Field Mapping:**
The TypeScript schema uses camelCase property names that map to snake_case database columns:
- `account` → `account_number`
- `amount` → `amount`
- `description` → `description`
- `createdAt` → `created_at`

## When to Use This Pattern

✅ **Use the protect operators pattern when:**
- You want clean, readable query syntax
- You're building standard CRUD applications
- You prefer minimal boilerplate code
- You want automatic encryption handling
- You're iterating quickly on features

This is the **recommended pattern** for most use cases.

**Alternative:** See [manual encryption pattern](/drizzle-protect) for explicit control over encryption workflow.

## Setup

Click the **▶ Run** button on any code example below to execute it against a live database and see real results.

---

## Select

### Select all

The simplest query - retrieve all transactions from the database.

```ts:run
const results = await db.select().from(transactions)
return results
```

### Select specific columns

Select only the columns you need.

```ts:run
const results = await db.select({
  id: transactions.id,
  amount: transactions.amount,
  createdAt: transactions.createdAt
}).from(transactions)
return results
```

### Limit results

Retrieve only the first 5 transactions.

```ts:run
const results = await db.select().from(transactions).limit(5)
return results
```

### Pagination with offset

Skip the first 5 transactions and get the next 5.

```ts:run
const results = await db.select()
  .from(transactions)
  .limit(5)
  .offset(5)
return results
```

---

## Equality operations with encrypted data

### Equality with encrypted number

Find transactions with a specific amount.

```ts:run
const results = await db.select()
  .from(transactions)
  .where(await protect.eq(transactions.amount, 800.00))
return results
```

### Equality with encrypted string

Find transactions with a specific description.

```ts:run
const results = await db.select()
  .from(transactions)
  .where(await protect.eq(transactions.description, 'Salary deposit'))
return results
```

### Equality with multiple encrypted columns

Find transactions matching multiple encrypted fields.

```ts:run
const results = await db.select()
  .from(transactions)
  .where(
    and(
      await protect.eq(transactions.account, '1234567890'),
      await protect.eq(transactions.amount, 800.00)
    )
  )
return results
```

---

## Comparison operations with encrypted data

### Less than or equal with encrypted number

Find transactions with amounts less than or equal to $150.

```ts:run
const results = await db.select()
  .from(transactions)
  .where(await protect.lte(transactions.amount, 150.00))
return results
```

### Greater than or equal with encrypted number

Find transactions with amounts greater than or equal to $1250.

```ts:run
const results = await db.select()
  .from(transactions)
  .where(await protect.gte(transactions.amount, 1250.00))
return results
```

---

## Text search with encrypted data

### LIKE with encrypted string

Search for transactions with "gym" in the description using full-text search.

```ts:run
const results = await db.select()
  .from(transactions)
  .where(await protect.like(transactions.description, '%gym%'))
return results
```

### Combine text search with other operations

Combine text search with comparison operations on different encrypted fields.

```ts:run
const results = await db.select()
  .from(transactions)
  .where(
    and(
      await protect.gte(transactions.amount, 150.00),
      await protect.like(transactions.description, '%payment%')
    )
  )
return results
```

---

## Range operations with encryption data

### Range with encrypted number

Find transactions with amounts between $150 and $1250.

```ts:run
const results = await db.select()
  .from(transactions)
  .where(
    and(
      await protect.gte(transactions.amount, 150.00),
      await protect.lte(transactions.amount, 1250.00)
    )
  )
return results
```

### Range with encrypted date

Find transactions from the past two weeks.

```ts:run
// Use relative dates - transactions are seeded 1-15 days ago
const now = new Date()
const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000)
const results = await db.select()
  .from(transactions)
  .where(
    and(
      await protect.gte(transactions.createdAt, twoWeeksAgo.getTime()),
      await protect.lte(transactions.createdAt, now.getTime())
    )
  )
return results
```

---

## Order by encrypted data

Protect.js supports ordering on encrypted fields using Order-Revealing Encryption (ORE). This allows the database to sort encrypted values without decrypting them, while preserving the original sort order.

### Order by encrypted number

Sort transactions by amount in descending order (highest first).

```ts:run
const results = await db.select()
  .from(transactions)
  .orderBy(desc(transactions.amount))
  .limit(10)
return results
```

### Order by encrypted string

Sort transactions by description in alphabetical order.

```ts:run
const results = await db.select()
  .from(transactions)
  .orderBy(asc(transactions.description))
  .limit(10)
return results
```

### Order by encrypted date

Sort transactions by creation date (most recent first).

```ts:run
const results = await db.select()
  .from(transactions)
  .orderBy(desc(transactions.createdAt))
  .limit(10)
return results
```

---

## Aggregation operations

### Count all transactions

Get the total number of transactions.

```ts:run
const result = await db.select({ count: sql`count(*)` })
  .from(transactions)
return result
```

### Count with condition

Count transactions with amounts greater than or equal to $1250.

```ts:run
const result = await db.select({ count: sql`count(*)` })
  .from(transactions)
  .where(await protect.gte(transactions.amount, 1250.00))
return result
```

### Find one transaction

Get a single transaction by primary key.

```ts:run
const result = await db.select()
  .from(transactions)
  .where(eq(transactions.id, 1))
  .limit(1)
return result
```

---

## Understanding the results

All results are automatically **decrypted** by Protect.js before being returned to you. The data remains encrypted in the database at all times.

### What's happening behind the scenes

1. **Query Construction**: You write normal Drizzle queries
2. **Encryption**: `protect` operators encrypt your search values
3. **Database Search**: PostgreSQL searches encrypted data using special indexes
4. **Decryption**: Results are decrypted before being returned
5. **Display**: You see plain text results

### Key benefits

- ✅ **Data encrypted at rest** - Database breaches don't expose sensitive data
- ✅ **Searchable encryption** - Equality, range, and text search work on encrypted fields
- ✅ **Familiar API** - Use standard Drizzle syntax with `protect`
- ✅ **Automatic decryption** - No manual decryption needed
- ✅ **Type safety** - Full TypeScript support

---

## Next steps

- **Explore the code**: Check out the source code in the repository
- **Try different queries**: Modify the examples above and run them
- **Read the docs**: Visit [CipherStash Protect.js documentation](https://docs.cipherstash.com/)
- **Integrate into your app**: Use these patterns in your own applications

---

## Security note

These examples use **read-only** queries for security. INSERT, UPDATE, and DELETE operations are disabled in this interactive environment.
