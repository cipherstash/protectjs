# Protect.js Drizzle ORM Integration

**Type-safe encryption for Drizzle ORM with searchable queries**

Seamlessly integrate Protect.js with Drizzle ORM and PostgreSQL to encrypt your data while maintaining full query capabilities—equality, range queries, text search, and sorting—all with complete TypeScript type safety.

## Features

- 🔒 **Type-safe encryption/decryption** using Drizzle's inferred types
- 🔍 **Searchable encryption** with equality, range, and text search
- ⚡ **Bulk operations** for high performance
- 🎯 **Use Drizzle operators** to query encrypted data

## Installation

```bash
npm install @cipherstash/protect @cipherstash/drizzle drizzle-orm
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

### 2. Initialize Protect.js

```typescript
// protect/config.ts
import { protect } from '@cipherstash/protect'
import { extractProtectSchema } from '@cipherstash/drizzle/pg'
import { usersTable } from '../db/schema'

// Extract Protect.js schema from Drizzle table
export const users = extractProtectSchema(usersTable)

// Initialize Protect.js client
export const protectClient = await protect({
  schemas: [users]
})
```

### 3. Create Protect operators

```typescript
// protect/operators.ts
import { createProtectOperators } from '@cipherstash/drizzle/pg'
import { protectClient } from './config'

// Create operators that automatically handle encryption in queries
export const protectOps = createProtectOperators(protectClient)
```

## Usage Examples

### Insert encrypted data

```typescript
const newUsers = [
  { email: 'john@example.com', age: 25, profile: { name: 'John', bio: 'Dev' } },
  { email: 'jane@example.com', age: 30, profile: { name: 'Jane', bio: 'Designer' } },
]

// Encrypt all models at once
const encryptedUsers = await protectClient.bulkEncryptModels(newUsers, users)
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
const decrypted = await protectClient.bulkDecryptModels(results)
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
  .where(await protectOps.eq(usersTable.email, 'jane@example.com'))

// Text search (LIKE/ILIKE)
const results = await db
  .select()
  .from(usersTable)
  .where(await protectOps.ilike(usersTable.email, 'smith'))

// Range queries
const results = await db
  .select()
  .from(usersTable)
  .where(
    await protectOps.and(
      protectOps.gte(usersTable.age, 25),
      protectOps.lte(usersTable.age, 35),
    ),
  )

// Decrypt results
const decrypted = await protectClient.bulkDecryptModels(results)
```

### Sorting encrypted columns

```typescript
const results = await db
  .select()
  .from(usersTable)
  .orderBy(protectOps.asc(usersTable.age))

const decrypted = await protectClient.bulkDecryptModels(results)
```

> [!IMPORTANT]
> Sorting with ORE on Supabase and other databases that don't support operator families will not work as expected.

### Complex queries with mixed operators

```typescript
import { eq } from 'drizzle-orm'

// Mix Protect operators (encrypted) with regular Drizzle operators (non-encrypted)
const results = await db
  .select()
  .from(usersTable)
  .where(
    await protectOps.and(
      // Protect operators for encrypted columns (batched for efficiency)
      protectOps.gte(usersTable.age, 25),
      protectOps.ilike(usersTable.email, 'developer'),
      // Regular Drizzle operators for non-encrypted columns
      eq(usersTable.id, 1),
    ),
  )
```

> [!TIP]
> **Performance Tip**: Using `protectOps.and()` batches all encryption operations into a single `createSearchTerms` call, which is more efficient than awaiting each operator individually.

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

### `extractProtectSchema(table)`

Extracts a Protect.js schema from a Drizzle table definition.

**Parameters:**
- `table` - Drizzle table definition with encrypted columns

**Returns:** Protect.js schema object

### `createProtectOperators(protectClient)`

Creates Drizzle-compatible operators that automatically handle encryption.

**Parameters:**
- `protectClient` - Initialized Protect.js client

**Returns:** Object with all operator functions
