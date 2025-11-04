# Drizzle ORM Integration with Protect.js

This comprehensive guide shows how to integrate Protect.js with Drizzle ORM for secure, type-safe database operations with encrypted data.

> [!WARNING]
> We are still working out the best dev experience for using Drizzle ORM with Protect.js.
> See the following notes for more details:

TODO: 
- [ ] While everything is working, full TypeScript support and documentation are a work in progress.
- [ ] Sorting with ORE on Supabase and other databases that don't support operator families (an EQL v2 function) may not work as expected.

---

## Overview

Protect.js integrates seamlessly with Drizzle ORM to provide:

- **Type-safe encryption/decryption** using Drizzle's inferred types
- **Searchable encryption** with equality, range, and text search capabilities
- **Bulk operations** for better performance
- **PostgreSQL composite types** for efficient storage
- **Automatic encryption** in queries using Protect operators

## Installation

```bash
# Install Drizzle ORM and dependencies
npm install drizzle-orm postgres

# Install Protect.js and Drizzle integration
npm install @cipherstash/protect @cipherstash/drizzle
```

## Basic Setup

### 1. Database Connection

```typescript
// db/connection.ts
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

const connectionString = process.env.DATABASE_URL!
const client = postgres(connectionString)
export const db = drizzle({ client })
```

### 2. Drizzle Table with Encrypted Columns

```typescript
// db/schema.ts
import { pgTable, integer, timestamp } from 'drizzle-orm/pg-core'
import { encryptedType } from '@cipherstash/drizzle/pg'

export const usersTable = pgTable('users', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  // String with searchable encryption
  email: encryptedType('email', {
    freeTextSearch: true,
    equality: true,
    orderAndRange: true,
  }),
  // Number with range queries
  age: encryptedType('age', {
    dataType: 'number',
    equality: true,
    orderAndRange: true,
  }),
  // Another number example
  score: encryptedType('score', {
    dataType: 'number',
    equality: true,
    orderAndRange: true,
  }),
  // JSON example
  profile: encryptedType('profile', {
    dataType: 'json',
  }),
  createdAt: timestamp('created_at').defaultNow(),
})
```

### 3. Initialize Protect.js

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

### 4. Create Protect Operators

```typescript
// protect/operators.ts
import { createProtectOperators } from '@cipherstash/drizzle/pg'
import { protectClient } from './config'

// Create operators that automatically handle encryption in queries
export const protectOps = createProtectOperators(protectClient)
```

## Query Examples

All examples assume you have imported:
- `db` from your database connection
- `usersTable` from your schema
- `users` from your Protect.js config (extracted schema from `usersTable`)
- `protectClient` from your Protect.js config
- `protectOps` from your Protect operators

### Insert (encrypt models then insert)

```typescript
interface NewUser {
  email: string
  age: number
  score: number
  profile: {
    name: string
    bio: string
    level: number
  }
}

const newUsers: NewUser[] = [
  {
    email: 'john.doe@example.com',
    age: 25,
    score: 85,
    profile: { name: 'John Doe', bio: 'Software engineer', level: 3 },
  },
  {
    email: 'jane.smith@example.com',
    age: 30,
    score: 92,
    profile: { name: 'Jane Smith', bio: 'Senior developer', level: 4 },
  },
]

// Encrypt all models at once
const encryptedUsers = await protectClient.bulkEncryptModels(newUsers, users)
if (encryptedUsers.failure) {
  throw new Error(`Encryption failed: ${encryptedUsers.failure.message}`)
}

// Insert encrypted data
await db.insert(usersTable).values(encryptedUsers.data)
```

### Select + Decrypt (single row)

```typescript
const selected = await db
  .select({
    id: usersTable.id,
    email: usersTable.email,
    age: usersTable.age,
    score: usersTable.score,
    profile: usersTable.profile,
  })
  .from(usersTable)
  .limit(1)

if (selected[0]) {
  const decrypted = await protectClient.decryptModel(selected[0])
  if (decrypted.failure) {
    throw new Error(`Decryption failed: ${decrypted.failure.message}`)
  }
  // Use decrypted.data
}
```

### Equality Search (eq)

```typescript
const searchEmail = 'jane.smith@example.com'

// Use Protect operators - encryption is handled automatically
const results = await db
  .select({
    id: usersTable.id,
    email: usersTable.email,
    age: usersTable.age,
    score: usersTable.score,
    profile: usersTable.profile,
  })
  .from(usersTable)
  .where(await protectOps.eq(usersTable.email, searchEmail))

// Decrypt results
const decrypted = await protectClient.bulkDecryptModels(results)
if (decrypted.failure) {
  throw new Error(`Decryption failed: ${decrypted.failure.message}`)
}
```

### Text Search (LIKE / ILIKE)

```typescript
const searchText = 'smith'

// Use Protect operators - encryption is handled automatically
const results = await db
  .select({
    id: usersTable.id,
    email: usersTable.email,
    age: usersTable.age,
    score: usersTable.score,
    profile: usersTable.profile,
  })
  .from(usersTable)
  .where(await protectOps.ilike(usersTable.email, searchText))

const decrypted = await protectClient.bulkDecryptModels(results)
if (decrypted.failure) {
  throw new Error(`Decryption failed: ${decrypted.failure.message}`)
}
```

### Number Range Queries (gte, lte)

```typescript
const minAge = 28
const maxAge = 35

// Use Protect operators - encryption is handled automatically
const results = await db
  .select({
    id: usersTable.id,
    email: usersTable.email,
    age: usersTable.age,
    score: usersTable.score,
    profile: usersTable.profile,
  })
  .from(usersTable)
  .where(
    and(
      await protectOps.gte(usersTable.age, minAge),
      await protectOps.lte(usersTable.age, maxAge),
    ),
  )

const decrypted = await protectClient.bulkDecryptModels(results)
if (decrypted.failure) {
  throw new Error(`Decryption failed: ${decrypted.failure.message}`)
}
```

### Between Operator

```typescript
const minAge = 25
const maxAge = 30

// Use Protect operators - encryption is handled automatically
const results = await db
  .select({
    id: usersTable.id,
    email: usersTable.email,
    age: usersTable.age,
    score: usersTable.score,
    profile: usersTable.profile,
  })
  .from(usersTable)
  .where(await protectOps.between(usersTable.age, minAge, maxAge))

const decrypted = await protectClient.bulkDecryptModels(results)
if (decrypted.failure) {
  throw new Error(`Decryption failed: ${decrypted.failure.message}`)
}
```

### InArray Operator

```typescript
const searchEmails = ['jane.smith@example.com', 'bob.wilson@example.com']

// Use Protect operators - encryption is handled automatically
const results = await db
  .select({
    id: usersTable.id,
    email: usersTable.email,
    age: usersTable.age,
    score: usersTable.score,
    profile: usersTable.profile,
  })
  .from(usersTable)
  .where(await protectOps.inArray(usersTable.email, searchEmails))

const decrypted = await protectClient.bulkDecryptModels(results)
if (decrypted.failure) {
  throw new Error(`Decryption failed: ${decrypted.failure.message}`)
}
```

### Sorting (ORE)

```typescript
// Use Protect operators - sorting encryption is handled automatically
const results = await db
  .select({
    id: usersTable.id,
    email: usersTable.email,
    age: usersTable.age,
    score: usersTable.score,
    profile: usersTable.profile,
  })
  .from(usersTable)
  .orderBy(protectOps.asc(usersTable.age))

const decrypted = await protectClient.bulkDecryptModels(results)
if (decrypted.failure) {
  throw new Error(`Decryption failed: ${decrypted.failure.message}`)
}
```

> [!NOTE]
> Sorting with ORE on Supabase and other databases that don't support operator families (an EQL v2 function) may not work as expected.

### Complex AND Query (multiple conditions)

```typescript
import { and } from 'drizzle-orm'

const minAge = 25
const maxAge = 35
const searchText = 'developer'

// Use Protect operators - encryption is handled automatically
const results = await db
  .select({
    id: usersTable.id,
    email: usersTable.email,
    age: usersTable.age,
    score: usersTable.score,
    profile: usersTable.profile,
  })
  .from(usersTable)
  .where(
    and(
      await protectOps.gte(usersTable.age, minAge),
      await protectOps.lte(usersTable.age, maxAge),
      await protectOps.ilike(usersTable.email, searchText),
    ),
  )

const decrypted = await protectClient.bulkDecryptModels(results)
if (decrypted.failure) {
  throw new Error(`Decryption failed: ${decrypted.failure.message}`)
}
```

## Available Operators

The `createProtectOperators` function provides all common Drizzle operators with automatic encryption handling:

### Comparison Operators
- `eq(left, right)` - Equality (async)
- `ne(left, right)` - Not equal (async)
- `gt(left, right)` - Greater than (async)
- `gte(left, right)` - Greater than or equal (async)
- `lt(left, right)` - Less than (async)
- `lte(left, right)` - Less than or equal (async)

### Range Operators
- `between(left, min, max)` - Between (async)
- `notBetween(left, min, max)` - Not between (async)

### Text Search Operators
- `like(left, right)` - LIKE (async)
- `ilike(left, right)` - ILIKE (case-insensitive) (async)
- `notIlike(left, right)` - NOT ILIKE (async)

### Array Operators
- `inArray(left, right[])` - In array (async)
- `notInArray(left, right[])` - Not in array (async)

### Sorting Operators
- `asc(column)` - Ascending order (sync)
- `desc(column)` - Descending order (sync)

### Logical Operators (pass-through)
- `and(...conditions)` - AND
- `or(...conditions)` - OR
- `not(condition)` - NOT

### Null/Exists Operators (pass-through)
- `isNull(column)` - IS NULL
- `isNotNull(column)` - IS NOT NULL
- `exists(subquery)` - EXISTS
- `notExists(subquery)` - NOT EXISTS