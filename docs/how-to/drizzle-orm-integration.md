# Drizzle ORM Integration with Protect.js

This comprehensive guide shows how to integrate Protect.js with Drizzle ORM for secure, type-safe database operations with encrypted data.

> [!WARNING]
> We are still working out the best dev experience for using Drizzle ORM with Protect.js.
> See the following notes for more details:

TODO: 
- [ ] Functionality wise, everything is working but some of the TypeScript support is not working as expected, and the documentation is still a work in progress.
- [ ] Figuere out how to extend the Drizzle Schema to support the Protect.js schema.
- [ ] We are also working on a custom type for Drizzle that will handle the conversion between Protect.js encrypted payloads and PostgreSQL composite types.
- [ ] Creating search terms for LIKE/ILIKE queries requires the use of the `returnType: 'composite-literal'` option which is not an ideal experience and not type safe.
- [ ] Sorting with ORE on Supabase and other databases that don't support operator families (an EQL v2 function) may not work as expected.

---

## Overview

Protect.js integrates seamlessly with Drizzle ORM to provide:

- **Type-safe encryption/decryption** using Drizzle's inferred types
- **Searchable encryption** with equality, range, and text search capabilities
- **Bulk operations** for better performance
- **PostgreSQL composite types** for efficient storage
- **Transaction support** for atomic operations

## Installation

```bash
# Install Drizzle ORM and dependencies
npm install drizzle-orm postgres

# Install Protect.js
npm install @cipherstash/protect
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

### 2. Protect.js Schema

```typescript
// protect/config.ts
import { protect, csTable, csColumn } from '@cipherstash/protect'

export const users = csTable('users', {
  // String example
  email: csColumn('email')
    .freeTextSearch()
    .equality()
    .orderAndRange(),
  // Number example
  age: csColumn('age')
    .dataType('number')
    .equality()
    .orderAndRange(),
  // Another number example
  score: csColumn('score')
    .dataType('number')
    .equality()
    .orderAndRange(),
  // JSON example
  profile: csColumn('profile').dataType('json'),
})

export const protectClient = await protect({
  schemas: [users]
})
```

### 3. Custom Encrypted Type

For better type safety and cleaner integration, you can create a custom Drizzle type that handles the conversion between Protect.js encrypted payloads and PostgreSQL composite types:

```typescript
// db/types.ts
import { customType } from 'drizzle-orm/pg-core'

// TODO - we can expose this in one of the Protect packages but need drizzle-orm as a peer dependency so we need to be careful with where we expose it.
export const encrypted = <TData>(name: string) =>
  customType<{ data: TData; driverData: string }>({
    dataType() {
      return 'eql_v2_encrypted'
    },
    toDriver(value: TData): string {
      // Convert to PostgreSQL composite type string format: (field1,field2,...)
      const jsonStr = JSON.stringify(value)
      // Escape quotes by doubling them for PostgreSQL
      const escaped = jsonStr.replace(/"/g, '""')
      // Wrap in outer parentheses and quotes
      return `("${escaped}")`
    },
    fromDriver(value: string): TData {
      // Parse PostgreSQL composite type string format: (field1,field2,...)
      const parseComposite = (str: string) => {
        if (!str || str === '') return null

        // Remove outer parentheses
        const trimmed = str.trim()

        if (trimmed.startsWith('(') && trimmed.endsWith(')')) {
          let inner = trimmed.slice(1, -1)

          // PostgreSQL escapes quotes by doubling them, so we need to unescape
          // Replace "" with " for proper JSON parsing
          inner = inner.replace(/""/g, '"')

          // Check if the inner value is a JSON-encoded string (starts and ends with quotes)
          if (inner.startsWith('"') && inner.endsWith('"')) {
            // Manually strip the outer quotes instead of using JSON.parse
            // This avoids issues with special characters (like backticks) in the JSON content
            const stripped = inner.slice(1, -1)

            // Now parse the stripped content as JSON
            return JSON.parse(stripped)
          }

          // Parse as JSON for objects/arrays
          if (inner.startsWith('{') || inner.startsWith('[')) {
            return JSON.parse(inner)
          }

          // Otherwise return the inner content
          return inner
        }

        // If not a composite format, try parsing as JSON
        return JSON.parse(str)
      }

      return parseComposite(value) as TData
    },
  })(name)
```

```typescript
// db/schema.ts
import { pgTable, integer } from 'drizzle-orm/pg-core'
import { encrypted } from './types'

// TODO - The is where it'd be nice to extend the Drizzle Schema to support the Protect.js schema via the custom type.
export const usersTable = pgTable('users', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  email: encrypted('email'),
  age: encrypted('age'),
  score: encrypted('score'),
  profile: encrypted('profile'),
})
```

### Query examples

#### Insert (encrypt models then insert)

```typescript
type NewUser = Omit<
  { id: number; email: string; age: number; score: number; profile: { name: string; bio: string; level: number } },
  'id'
>

const newUsers: NewUser[] = [
  { email: 'john.doe@example.com', age: 25, score: 85, profile: { name: 'John Doe', bio: 'Software engineer', level: 3 } },
  { email: 'jane.smith@example.com', age: 30, score: 92, profile: { name: 'Jane Smith', bio: 'Senior developer', level: 4 } },
]

const encryptedUsers = await protectClient.bulkEncryptModels(newUsers, users)
if (encryptedUsers.failure) throw encryptedUsers.failure

await db.insert(usersTable).values(encryptedUsers.data)
```

#### Select + decrypt (single row)

```typescript
const selected = await db
  .select({ id: usersTable.id, email: usersTable.email, age: usersTable.age, score: usersTable.score, profile: usersTable.profile })
  .from(usersTable)
  .limit(1)

const decrypted = await protectClient.decryptModel(selected[0])
if (decrypted.failure) throw decrypted.failure
// use decrypted.data
```

#### Equality search (eq)

```typescript
import { eq } from 'drizzle-orm'

const email = 'jane.smith@example.com'
const terms = await protectClient.createSearchTerms([{ value: email, column: users.email, table: users }])
if (terms.failure) throw terms.failure

const eqResults = await db
  .select({ id: usersTable.id, email: usersTable.email, age: usersTable.age, score: usersTable.score, profile: usersTable.profile })
  .from(usersTable)
  .where(eq(usersTable.email, terms.data[0]))

const decryptedEq = await protectClient.bulkDecryptModels(eqResults)
if (decryptedEq.failure) throw decryptedEq.failure
```

#### Text search (LIKE / ILIKE) using composite literal

```typescript
import { like, ilike } from 'drizzle-orm'

const text = 'smith'
const textTerms = await protectClient.createSearchTerms([
  { value: text, column: users.email, table: users, returnType: 'composite-literal' },
])
if (textTerms.failure) throw textTerms.failure

// LIKE
const likeResults = await db
  .select({ id: usersTable.id, email: usersTable.email, age: usersTable.age, score: usersTable.score, profile: usersTable.profile })
  .from(usersTable)
  // TODO - Creating search terms for LIKE/ILIKE queries requires the use of the `returnType: 'composite-literal'` option which is not an ideal experience and not type safe.
  .where(like(usersTable.email, textTerms.data[0]))

// ILIKE
const ilikeResults = await db
  .select({ id: usersTable.id, email: usersTable.email, age: usersTable.age, score: usersTable.score, profile: usersTable.profile })
  .from(usersTable)
  .where(ilike(usersTable.email, textTerms.data[0]))

const decryptedLike = await protectClient.bulkDecryptModels(likeResults)
if (decryptedLike.failure) throw decryptedLike.failure
```

#### Number range (gte/lte)

```typescript
import { gte, lte } from 'drizzle-orm'

const minAge = 28
const maxAge = 35
const rangeTerms = await protectClient.createSearchTerms([
  { value: minAge, column: users.age, table: users },
  { value: maxAge, column: users.age, table: users },
])
if (rangeTerms.failure) throw rangeTerms.failure

const rangeResults = await db
  .select({ id: usersTable.id, email: usersTable.email, age: usersTable.age, score: usersTable.score, profile: usersTable.profile })
  .from(usersTable)
  .where(gte(usersTable.age, rangeTerms.data[0]))

const decryptedRange = await protectClient.bulkDecryptModels(rangeResults)
if (decryptedRange.failure) throw decryptedRange.failure
```

#### Sorting (ORE) — Supabase-compatible form

```typescript
import { asc, sql } from 'drizzle-orm'

const sorted = await db
  .select({ id: usersTable.id, email: usersTable.email, age: usersTable.age, score: usersTable.score, profile: usersTable.profile })
  .from(usersTable)
  // TODO - Sorting with ORE on Supabase and other databases that don't support operator families (an EQL v2 function) may not work as expected.
  .orderBy(asc(sql`eql_v2.order_by(age)`))

const decryptedSorted = await protectClient.bulkDecryptModels(sorted)
if (decryptedSorted.failure) throw decryptedSorted.failure
```

#### Complex AND query (gte, lte, ilike)

```typescript
import { and } from 'drizzle-orm'

const qText = 'developer'
const complexTerms = await protectClient.createSearchTerms([
  { value: minAge, column: users.age, table: users },
  { value: maxAge, column: users.age, table: users },
  // TODO - Creating search terms for LIKE/ILIKE queries requires the use of the `returnType: 'composite-literal'` option which is not an ideal experience and not type safe.
  { value: qText, column: users.email, table: users, returnType: 'composite-literal' },
])
if (complexTerms.failure) throw complexTerms.failure

const complexResults = await db
  .select({ id: usersTable.id, email: usersTable.email, age: usersTable.age, score: usersTable.score, profile: usersTable.profile })
  .from(usersTable)
  .where(
    and(
      gte(usersTable.age, complexTerms.data[0]),
      lte(usersTable.age, complexTerms.data[1]),
      ilike(usersTable.email, complexTerms.data[2]),
    ),
  )

const decryptedComplex = await protectClient.bulkDecryptModels(complexResults)
if (decryptedComplex.failure) throw decryptedComplex.failure
```