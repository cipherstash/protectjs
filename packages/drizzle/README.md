# Stash Encryption — Drizzle ORM Integration

**Type-safe encryption for Drizzle ORM with searchable queries**

Seamlessly integrate Stash Encryption with Drizzle ORM and PostgreSQL to encrypt your data while maintaining full query capabilities—equality, range queries, text search, and sorting—all with complete TypeScript type safety.

## Features

- 🔒 **Type-safe encryption/decryption** using Drizzle's inferred types
- 🔍 **Searchable encryption** with equality, range, and text search
- ⚡ **Bulk operations** for high performance
- 🎯 **Use Drizzle operators** to query encrypted data

## Installation

```bash
npm install @cipherstash/stack @cipherstash/drizzle drizzle-orm
```

> [!NOTE]
> **Migrating from `@cipherstash/protect`?** Replace `@cipherstash/protect` with `@cipherstash/stack` in your imports. The `protect()` function is now `Encryption()`. All old names remain available as deprecated aliases.

## Database Setup

Before using encrypted columns, you need to install the CipherStash EQL (Encrypt Query Language) functions in your PostgreSQL database.

### Install EQL via migration

The easiest way is to use the built-in CLI command:

```bash
npx generate-eql-migration
# or: pnpm/yarn/bun generate-eql-migration
```

This will:
1. Generate a custom Drizzle migration (default name: `install-eql`)
2. Populate it with the EQL SQL schema from `@cipherstash/schema`
3. Place it in your `drizzle/` directory

Then run your migrations:

```bash
npx drizzle-kit migrate
# or: pnpm/yarn/bun drizzle-kit migrate
```

#### CLI Options

```bash
Usage: generate-eql-migration [options]

Options:
  -n, --name <name>    Migration name (default: "install-eql")
  -o, --out <dir>      Output directory (default: "drizzle")
  -h, --help           Display this help message

Examples:
  npx generate-eql-migration
  npx generate-eql-migration --name setup-eql
  npx generate-eql-migration --out migrations
```

### Manual installation (alternative)

If you prefer to install EQL manually:

```bash
npx drizzle-kit generate --custom --name=install-eql
curl -sL https://github.com/cipherstash/encrypt-query-language/releases/latest/download/cipherstash-encrypt.sql > drizzle/0001_install-eql.sql
npx drizzle-kit migrate
```

## Quick Start

### 1. Define your schema with encrypted columns

```typescript
// db/schema.ts
import { pgTable, integer, timestamp } from 'drizzle-orm/pg-core'
import { encryptedType } from '@cipherstash/drizzle/pg'

export const usersTable = pgTable('users', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  
  // String with searchable encryption
  email: encryptedType<string>('email', {
    freeTextSearch: true,
    equality: true,
    orderAndRange: true,
  }),
  
  // Number with range queries
  age: encryptedType<number>('age', {
    dataType: 'number',
    equality: true,
    orderAndRange: true,
  }),
  
  // JSON object with typed structure
  profile: encryptedType<{ name: string; bio: string }>('profile', {
    dataType: 'json',
  }),
  
  createdAt: timestamp('created_at').defaultNow(),
})
```

> [!TIP]
> **Type Safety Tip**: Always specify the type parameter (`encryptedType<string>`, `encryptedType<number>`, etc.) to maintain type safety after decryption. 
> Without it, decrypted values will be typed as `unknown`.
>
> This is because the database only stores and returns encrypted ciphertext, so it doesn't know the underlying original type. You must specify the decrypted type in your ORM schema for full type safety.

### 2. Initialize Stash Encryption

```typescript
// protect/config.ts
import { Encryption } from '@cipherstash/stack'
import { extractEncryptionSchema } from '@cipherstash/drizzle/pg'
import { usersTable } from '../db/schema'

// Extract Stash Encryption schema from Drizzle table
export const users = extractEncryptionSchema(usersTable)

// Initialize Stash Encryption client
export const encryptionClient = await Encryption({
  schemas: [users]
})
```

### 3. Create encryption operators

```typescript
// protect/operators.ts
import { createEncryptionOperators } from '@cipherstash/drizzle/pg'
import { encryptionClient } from './config'

// Create operators that automatically handle encryption in queries
export const encryptionOps = createEncryptionOperators(encryptionClient)
```

## Usage Examples

### Insert encrypted data

```typescript
const newUsers = [
  { email: 'john@example.com', age: 25, profile: { name: 'John', bio: 'Dev' } },
  { email: 'jane@example.com', age: 30, profile: { name: 'Jane', bio: 'Designer' } },
]

// Encrypt all models at once
const encryptedUsers = await encryptionClient.bulkEncryptModels(newUsers, users)
if (encryptedUsers.failure) {
  throw new Error(`Encryption failed: ${encryptedUsers.failure.message}`)
}

// Insert encrypted data
await db.insert(usersTable).values(encryptedUsers.data)
```

### Select and decrypt

```typescript
const results = await db
  .select({
    id: usersTable.id,
    email: usersTable.email,
    age: usersTable.age,
    profile: usersTable.profile,
  })
  .from(usersTable)

// Decrypt all results
const decrypted = await encryptionClient.bulkDecryptModels(results)
if (decrypted.failure) {
  throw new Error(`Decryption failed: ${decrypted.failure.message}`)
}

// TypeScript knows the types: email is string, age is number, etc.
decrypted.data.forEach(user => {
  console.log(user.email) // ✅ string
  console.log(user.age) // ✅ number
  console.log(user.profile.name) // ✅ string
})
```

### Search with encrypted columns

```typescript
// Equality search
const results = await db
  .select()
  .from(usersTable)
  .where(await encryptionOps.eq(usersTable.email, 'jane@example.com'))

// Text search (LIKE/ILIKE)
const results = await db
  .select()
  .from(usersTable)
  .where(await encryptionOps.ilike(usersTable.email, 'smith'))

// Range queries
const results = await db
  .select()
  .from(usersTable)
  .where(
    await encryptionOps.and(
      encryptionOps.gte(usersTable.age, 25),
      encryptionOps.lte(usersTable.age, 35),
    ),
  )

// Decrypt results
const decrypted = await encryptionClient.bulkDecryptModels(results)
```

### Sorting encrypted columns

```typescript
const results = await db
  .select()
  .from(usersTable)
  .orderBy(encryptionOps.asc(usersTable.age))

const decrypted = await encryptionClient.bulkDecryptModels(results)
```

> [!IMPORTANT]
> Sorting with ORE on Supabase and other databases that don't support operator families will not work as expected.

### Complex queries with mixed operators

```typescript
import { eq } from 'drizzle-orm'

// Mix encryption operators (encrypted) with regular Drizzle operators (non-encrypted)
const results = await db
  .select()
  .from(usersTable)
  .where(
    await encryptionOps.and(
      // Encryption operators for encrypted columns (batched for efficiency)
      encryptionOps.gte(usersTable.age, 25),
      encryptionOps.ilike(usersTable.email, 'developer'),
      // Regular Drizzle operators for non-encrypted columns
      eq(usersTable.id, 1),
    ),
  )
```

> [!TIP]
> **Performance Tip**: Using `encryptionOps.and()` batches all encryption operations into a single `createSearchTerms` call, which is more efficient than awaiting each operator individually.

## Available Operators

All operators automatically handle encryption for encrypted columns.

### Comparison Operators (async)
- `eq(left, right)` - Equality
- `ne(left, right)` - Not equal
- `gt(left, right)` - Greater than
- `gte(left, right)` - Greater than or equal
- `lt(left, right)` - Less than
- `lte(left, right)` - Less than or equal

### Range Operators (async)
- `between(left, min, max)` - Between
- `notBetween(left, min, max)` - Not between

### Text Search Operators (async)
- `like(left, right)` - LIKE
- `ilike(left, right)` - ILIKE (case-insensitive)
- `notIlike(left, right)` - NOT ILIKE

### Array Operators (async)
- `inArray(left, right[])` - In array
- `notInArray(left, right[])` - Not in array

### Sorting Operators (sync)
- `asc(column)` - Ascending order
- `desc(column)` - Descending order

### Logical Operators
- `and(...conditions)` - AND (batches encryption operations)
- `or(...conditions)` - OR
- `not(condition)` - NOT

### Null/Exists Operators
- `isNull(column)` - IS NULL
- `isNotNull(column)` - IS NOT NULL
- `exists(subquery)` - EXISTS
- `notExists(subquery)` - NOT EXISTS

## API Reference

### `encryptedType<T>(columnName, options)`

Creates an encrypted column type for Drizzle schemas.

**Type Parameters:**
- `T` - The TypeScript type of the decrypted value (e.g., `string`, `number`, or a custom object type)

**Options:**
- `dataType?: 'string' | 'number' | 'json'` - Data type (default: `'string'`)
- `freeTextSearch?: boolean` - Enable text search (LIKE/ILIKE)
- `equality?: boolean` - Enable equality queries
- `orderAndRange?: boolean` - Enable range queries and sorting

### `extractEncryptionSchema(table)`

Extracts a Stash Encryption schema from a Drizzle table definition.

**Parameters:**
- `table` - Drizzle table definition with encrypted columns

**Returns:** Stash Encryption schema object

### `createEncryptionOperators(encryptionClient)`

Creates Drizzle-compatible operators that automatically handle encryption.

**Parameters:**
- `encryptionClient` - Initialized Stash Encryption client

**Returns:** Object with all operator functions
