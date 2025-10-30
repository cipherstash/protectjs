# Drizzle ORM Integration with Protect.js

This comprehensive guide shows how to integrate Protect.js with Drizzle ORM for secure, type-safe database operations with encrypted data.

> [!WARNING]
> We are still working out the best dev experience for using Drizzle ORM with Protect.js.
> See the following notes for more details:

TODO: 
- [ ] Functionality wise, everything is working but some of the TypeScript support is not working as expected, and the documentation is still a work in progress.
- [ ] We are also working on a custom type for Drizzle that will handle the conversion between Protect.js encrypted payloads and PostgreSQL composite types.
- [ ] Creating search terms for LIKE/ILIKE queries requires the use of the `returnType: 'composite-literal'` option which is not an ideal experience and not type safe.
- [ ] Sorting with ORE on Supabase and other databases that don't support operator families (an EQL v2 function) may not work as expected.

## Table of Contents

- [Overview](#overview)
- [Installation](#installation)
- [Basic Setup](#basic-setup)
- [Schema Definition](#schema-definition)
- [Database Operations](#database-operations)
  - [Encrypting Data](#encrypting-data)
  - [Decrypting Data](#decrypting-data)
  - [Bulk Operations](#bulk-operations)
- [Searchable Encryption](#searchable-encryption)
  - [Text Search](#text-search)
  - [Number Queries](#number-queries)
  - [Range Queries](#range-queries)
  - [Sorting](#sorting)
- [Advanced Patterns](#advanced-patterns)
  - [Type Safety](#type-safety)
  - [Error Handling](#error-handling)
  - [Transaction Support](#transaction-support)
- [Complete Examples](#complete-examples)
- [Best Practices](#best-practices)

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
npm install drizzle-orm drizzle-kit

# Install database driver (choose one)
npm install postgres  # For PostgreSQL
npm install mysql2    # For MySQL
npm install better-sqlite3  # For SQLite

# Install Protect.js
npm install @cipherstash/protect @cipherstash/schema
```

## Basic Setup

### 1. Database Connection

```typescript
// db/connection.ts
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

const connectionString = process.env.DATABASE_URL!
const sql = postgres(connectionString)
export const db = drizzle(sql)
```

### 2. Protect.js Configuration

```typescript
// protect/config.ts
import { protect, csTable, csColumn, csValue } from '@cipherstash/protect'

export const users = csTable('users', {
  email: csColumn('email')
    .freeTextSearch()
    .equality()
    .orderAndRange(),
  age: csColumn('age')
    .dataType('number')
    .equality()
    .orderAndRange(),
  // Nested fields use csValue (not searchable)
  profile: {
    name: csValue('profile.name'),
    score: csValue('profile.score').dataType('number'),
  }
})

export const protectClient = await protect({
  schemas: [users]
})
```

### 3. Drizzle Schema

```typescript
// db/schema.ts
import { pgTable, serial, jsonb, varchar } from 'drizzle-orm/pg-core'
import { InferSelectModel, InferInsertModel } from 'drizzle-orm'

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: jsonb('email').notNull(),
  age: jsonb('age'),
  profile: jsonb('profile'),
  createdAt: varchar('created_at', { length: 255 }).notNull(),
})

// Type inference
export type User = InferSelectModel<typeof users>
export type NewUser = InferInsertModel<typeof users>
```

### 4. Custom Encrypted Type (Advanced)

For better type safety and cleaner integration, you can create a custom Drizzle type that handles the conversion between Protect.js encrypted payloads and PostgreSQL composite types:

```typescript
// db/types.ts
import { customType } from 'drizzle-orm/pg-core'

const encrypted = <TData>(name: string) =>
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

export { encrypted }
```

```typescript
// db/schema.ts
import { pgTable, integer } from 'drizzle-orm/pg-core'
import { encrypted } from './types'

export const usersTable = pgTable('users', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  encrypted_email: encrypted('encrypted_email'),
  encrypted_dob: encrypted('encrypted_dob'),
  encrypted_salary: encrypted('encrypted_salary'),
  encrypted_jsonb: encrypted('encrypted_jsonb'),
})
```

**Benefits of Custom Type Approach:**
- **Type Safety**: Direct mapping between TypeScript types and database columns
- **Automatic Conversion**: Handles PostgreSQL composite type parsing automatically
- **Cleaner Code**: No manual conversion between encrypted payloads and database values
- **Better Performance**: Reduces overhead of manual JSON parsing

## Schema Definition

### Text Fields

```typescript
import { csTable, csColumn, csValue } from '@cipherstash/schema'

const users = csTable('users', {
  // Basic text field
  name: csColumn('name'),
  
  // Searchable text field
  email: csColumn('email')
    .freeTextSearch()    // Enable full-text search
    .equality()          // Enable exact matching
    .orderAndRange(),    // Enable sorting and range queries
  
  // Nested text field (NOT searchable)
  profile: {
    bio: csValue('profile.bio'),
  }
})
```

### Number Fields

```typescript
const users = csTable('users', {
  // Basic number field
  age: csColumn('age').dataType('number'),
  
  // Searchable number field
  score: csColumn('score')
    .dataType('number')
    .equality()          // Enable exact matching
    .orderAndRange(),    // Enable sorting and range queries
  
  // Nested number field (NOT searchable)
  metadata: {
    count: csValue('metadata.count').dataType('number'),
    level: csValue('metadata.level').dataType('number'),
  }
})
```

**Important Notes about Nested Fields:**
- **Use `csValue`** for all nested fields, never `csColumn`
- **Nested fields are NOT searchable** - they can only be encrypted/decrypted
- **Maximum nesting depth** is 3 levels
- **Dot notation** is used for the field path (e.g., `'profile.bio'`, `'metadata.settings.theme'`)
- **For searchable fields**, use separate `csColumn` definitions at the top level

### Drizzle Schema Mapping

```typescript
// db/schema.ts
import { pgTable, serial, jsonb } from 'drizzle-orm/pg-core'

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  // Encrypted fields are stored as JSONB
  email: jsonb('email').notNull(),
  age: jsonb('age'),
  profile: jsonb('profile'),
})
```

## Database Operations

### Encrypting Data

#### Single Field Encryption

```typescript
import { protectClient, users } from './protect/config'
import { db } from './db/connection'

// Encrypt a single field
const email = 'user@example.com'
const encryptedEmail = await protectClient.encrypt(email, {
  column: users.email,
  table: users,
})

if (encryptedEmail.failure) {
  throw new Error(`Encryption failed: ${encryptedEmail.failure.message}`)
}

// Insert into database
await db.insert(users).values({
  email: encryptedEmail.data,
})
```

#### Model Encryption

```typescript
// Encrypt entire model
const userData = {
  email: 'user@example.com',
  age: 25,
  profile: {
    name: 'John Doe',
    score: 95
  }
}

const encryptedUser = await protectClient.encryptModel(userData, users)

if (encryptedUser.failure) {
  throw new Error(`Encryption failed: ${encryptedUser.failure.message}`)
}

// Insert into database
await db.insert(users).values({
  email: encryptedUser.data.email,
  age: encryptedUser.data.age,
  profile: encryptedUser.data.profile,
})
```

### Decrypting Data

```typescript
// Query encrypted data
const result = await db.select().from(users).where(eq(users.id, 1))
const user = result[0]

// Decrypt individual fields
const decryptedEmail = await protectClient.decrypt(user.email)
const decryptedAge = await protectClient.decrypt(user.age)

// Decrypt entire model
const decryptedUser = await protectClient.decryptModel(user)

if (decryptedUser.failure) {
  throw new Error(`Decryption failed: ${decryptedUser.failure.message}`)
}

console.log('Decrypted user:', decryptedUser.data)
```

### Using Custom Encrypted Types

When using the custom `encrypted` type, the database operations become much cleaner:

```typescript
// db/schema.ts
import { pgTable, integer } from 'drizzle-orm/pg-core'
import { encrypted } from './types'

export const usersTable = pgTable('users', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  encrypted_email: encrypted('encrypted_email'),
  encrypted_age: encrypted('encrypted_age'),
  encrypted_profile: encrypted('encrypted_profile'),
})

// services/userService.ts
import { protectClient, users as protectUsers } from '../protect/schema'
import { db, usersTable } from '../db/schema'
import { eq } from 'drizzle-orm'

export class UserService {
  async createUser(userData: {
    email: string
    age: number
    profile: { name: string; bio: string }
  }) {
    // Encrypt individual fields
    const encryptedEmail = await protectClient.encrypt(userData.email, {
      column: protectUsers.email,
      table: protectUsers,
    })
    
    const encryptedAge = await protectClient.encrypt(userData.age, {
      column: protectUsers.age,
      table: protectUsers,
    })
    
    const encryptedProfile = await protectClient.encrypt(userData.profile, {
      column: protectUsers.profile,
      table: protectUsers,
    })
    
    if (encryptedEmail.failure || encryptedAge.failure || encryptedProfile.failure) {
      throw new Error('Encryption failed')
    }
    
    // Insert with automatic type conversion
    const [user] = await db.insert(usersTable).values({
      encrypted_email: encryptedEmail.data,
      encrypted_age: encryptedAge.data,
      encrypted_profile: encryptedProfile.data,
    }).returning()
    
    return user
  }
  
  async getUserById(id: number) {
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, id))
    
    if (!user) return null
    
    // Decrypt fields
    const decryptedEmail = await protectClient.decrypt(user.encrypted_email)
    const decryptedAge = await protectClient.decrypt(user.encrypted_age)
    const decryptedProfile = await protectClient.decrypt(user.encrypted_profile)
    
    return {
      id: user.id,
      email: decryptedEmail.data,
      age: decryptedAge.data,
      profile: decryptedProfile.data,
    }
  }
}
```

**Key Benefits:**
- **Automatic Conversion**: The custom type handles PostgreSQL composite type conversion automatically
- **Type Safety**: Direct TypeScript types without manual casting
- **Cleaner Code**: No need for manual `encryptedToPgComposite` conversions
- **Better Performance**: Reduced overhead from manual JSON parsing

### Approach Comparison

| Feature | JSONB Approach | Custom Type Approach |
|---------|----------------|---------------------|
| **Setup Complexity** | Simple | Moderate |
| **Type Safety** | Good | Excellent |
| **Code Cleanliness** | Good | Excellent |
| **Performance** | Good | Better |
| **Learning Curve** | Low | Medium |
| **Production Ready** | Yes | Recommended |
| **Manual Conversions** | Required | Automatic |
| **PostgreSQL Integration** | Manual | Seamless |

**When to use JSONB approach:**
- Prototyping and small applications
- Quick setup requirements
- Simple data structures
- Learning Protect.js integration

**When to use Custom Type approach:**
- Production applications
- Complex data structures
- High type safety requirements
- Long-term maintainability
- Team development

### Bulk Operations

```typescript
// Bulk encrypt
const usersData = [
  { email: 'user1@example.com', age: 25 },
  { email: 'user2@example.com', age: 30 },
  { email: 'user3@example.com', age: 35 },
]

const encryptedUsers = await protectClient.bulkEncryptModels(usersData, users)

if (encryptedUsers.failure) {
  throw new Error(`Bulk encryption failed: ${encryptedUsers.failure.message}`)
}

// Bulk insert
await db.insert(users).values(
  encryptedUsers.data.map(user => ({
    email: user.email,
    age: user.age,
  }))
)

// Bulk decrypt
const allUsers = await db.select().from(users)
const decryptedUsers = await protectClient.bulkDecryptModels(allUsers)

if (decryptedUsers.failure) {
  throw new Error(`Bulk decryption failed: ${decryptedUsers.failure.message}`)
}
```

## Searchable Encryption

### Search Term Return Types

Protect.js supports different return types for search terms depending on your use case:

```typescript
// Default return type (encrypted payload object)
const defaultTerm = await protectClient.createSearchTerms([{
  value: 'search text',
  column: users.email,
  table: users,
}])
// Returns: { c: "encrypted_value", t: "type", v: "version" }

// Composite literal (for PostgreSQL composite types)
const compositeTerm = await protectClient.createSearchTerms([{
  value: 'search text',
  column: users.email,
  table: users,
  returnType: 'composite-literal'
}])
// Returns: "(encrypted_value)" - ready for PostgreSQL composite type queries

// Escaped composite literal (for complex nested queries)
const escapedTerm = await protectClient.createSearchTerms([{
  value: 'search text',
  column: users.email,
  table: users,
  returnType: 'escaped-composite-literal'
}])
// Returns: "\"(encrypted_value)\"" - for nested JSON queries
```

**When to use each:**
- **Default**: When working with Supabase or other services that handle the conversion
- **composite-literal**: For direct PostgreSQL queries without custom types (manual conversion)
- **escaped-composite-literal**: For complex nested JSON queries or when you need additional escaping

**Note for Drizzle ORM with Custom Types:**
When using the custom `encrypted` type, you don't need to specify `returnType` as the custom type handles the conversion automatically. Simply omit the `returnType` property from your search terms.

### Text Search

```typescript
import { eq, like, gte, lte, asc, and } from 'drizzle-orm'

// Create search term (note the returnType for LIKE/ILIKE)
const searchTerm = await protectClient.createSearchTerms([{
  value: 'john',
  column: users.email,
  table: users,
  returnType: 'composite-literal',
}])

if (searchTerm.failure) {
  throw new Error(`Search term creation failed: ${searchTerm.failure.message}`)
}

// Full-text search using Drizzle operators
// @ts-ignore - composite-literal returns a string for the composite, which is compatible at runtime
const results = await db
  .select()
  .from(users)
  .where(like(users.email, searchTerm.data[0]))

// Decrypt results
const decryptedResults = await protectClient.bulkDecryptModels(results)
```

### Equality Search

For exact matches, use Drizzle's `.eq()` operator:

```typescript
// Create search term for equality
const searchTerm = await protectClient.createSearchTerms([{
  value: 'user@example.com',
  column: users.email,
  table: users,
}])

if (searchTerm.failure) {
  throw new Error(`Search term creation failed: ${searchTerm.failure.message}`)
}

// Equality search using Drizzle operators
const results = await db
  .select()
  .from(users)
  .where(eq(users.email, searchTerm.data[0]))

// Decrypt results
const decryptedResults = await protectClient.bulkDecryptModels(results)
```

### Number Queries

```typescript
// Equality query (no returnType needed for numbers)
const ageSearchTerm = await protectClient.createSearchTerms([{
  value: 25,
  column: users.age,
  table: users,
}])

// Exact match using Drizzle operators
const exactResults = await db
  .select()
  .from(users)
  .where(eq(users.age, ageSearchTerm.data[0]))

// Range query (age >= 25) using Drizzle operators
const rangeResults = await db
  .select()
  .from(users)
  .where(gte(users.age, ageSearchTerm.data[0]))

// Sorting (see Sorting section below for Supabase/PG note)
const sortedResults = await db
  .select()
  .from(users)
  .orderBy(asc(users.age))
```

### Complex Queries

```typescript
import { ilike } from 'drizzle-orm'

// Multiple conditions
const terms = await protectClient.createSearchTerms([
  { value: 25, column: users.age, table: users },
  { value: 35, column: users.age, table: users },
  { value: 'john', column: users.email, table: users, returnType: 'composite-literal' }
])

// Age between 25 and 35, and email contains 'john' using Drizzle operators
// @ts-ignore - composite-literal is a string at runtime, accepted by ilike
const complexResults = await db
  .select()
  .from(users)
  .where(
    and(
      gte(users.age, terms.data[0]),
      lte(users.age, terms.data[1]),
      ilike(users.email, terms.data[2])
    )
  )
```

### Sorting

When ordering by encrypted number columns with ORE, some environments (e.g., Supabase Postgres without operator family support) require calling the EQL order function explicitly.

```typescript
import { sql, asc } from 'drizzle-orm'

const results = await db
  .select({ id: users.id, age: users.age })
  .from(users)
  // Required on Supabase/PG without operator families
  .orderBy(asc(sql`eql_v2.order_by(age)`))
```

## Advanced Patterns

### Type Safety

```typescript
import { InferSelectModel } from 'drizzle-orm'

type User = InferSelectModel<typeof users>

// Type-safe encryption
const encryptUser = async (userData: Omit<User, 'id'>) => {
  const encrypted = await protectClient.encryptModel<User>(userData, users)
  return encrypted
}

// Type-safe decryption
const decryptUser = async (encryptedUser: User) => {
  const decrypted = await protectClient.decryptModel<User>(encryptedUser)
  return decrypted
}
```

### Error Handling

```typescript
const safeEncrypt = async (data: any) => {
  const result = await protectClient.encryptModel(data, users)
  
  if (result.failure) {
    console.error('Encryption failed:', {
      type: result.failure.type,
      message: result.failure.message,
      data: data
    })
    return null
  }
  
  return result.data
}

const safeDecrypt = async (encryptedData: any) => {
  const result = await protectClient.decryptModel(encryptedData)
  
  if (result.failure) {
    console.error('Decryption failed:', {
      type: result.failure.type,
      message: result.failure.message,
      encryptedData: encryptedData
    })
    return null
  }
  
  return result.data
}
```

### Transaction Support

```typescript
import { db } from './db/connection'

const createUserWithProfile = async (userData: any, profileData: any) => {
  return await db.transaction(async (tx) => {
    // Encrypt user data
    const encryptedUser = await protectClient.encryptModel(userData, users)
    if (encryptedUser.failure) {
      throw new Error(`User encryption failed: ${encryptedUser.failure.message}`)
    }
    
    // Insert user
    const [user] = await tx.insert(users).values({
      email: encryptedUser.data.email,
      age: encryptedUser.data.age,
    }).returning()
    
    // Encrypt profile data
    const encryptedProfile = await protectClient.encryptModel(profileData, profiles)
    if (encryptedProfile.failure) {
      throw new Error(`Profile encryption failed: ${encryptedProfile.failure.message}`)
    }
    
    // Insert profile
    await tx.insert(profiles).values({
      userId: user.id,
      bio: encryptedProfile.data.bio,
      score: encryptedProfile.data.score,
    })
    
    return user
  })
}
```

## Complete Examples

### Practical Search Example

Here's a complete example that demonstrates searching for a user by email:

```typescript
// search-user.ts
import 'dotenv/config'
import { db } from './db'
import { usersTable } from './db/schema'
import { protectClient, users } from './protect'
import { eq } from 'drizzle-orm'

if (process.argv.length < 3) {
  console.error('Usage: pnpm run search-user <email>')
  process.exit(1)
}

const searchEmail = process.argv[2]

console.log(`Searching for user with email: ${searchEmail}`)

// Generate encrypted search term for equality search
const searchTerm = await protectClient.createSearchTerms([
  {
    value: searchEmail,
    column: users.email,
    table: users,
  },
])

if (searchTerm.failure) {
  throw new Error(searchTerm.failure.message)
}

console.log('Generated encrypted search term')

// Query database using the encrypted search term with Drizzle operators
const results = await db
  .select({
    id: usersTable.id,
    encrypted_email: usersTable.encrypted_email,
    encrypted_dob: usersTable.encrypted_dob,
    encrypted_salary: usersTable.encrypted_salary,
  })
  .from(usersTable)
  .where(eq(usersTable.encrypted_email, searchTerm.data[0]))

console.log('Results:', results)
console.log(`Found ${results.length} result(s)`)

if (results.length === 0) {
  console.log('No users found with that email')
  process.exit(0)
}

// Decrypt the results
const decrypted = await protectClient.bulkDecryptModels(results)

if (decrypted.failure) {
  throw new Error(decrypted.failure.message)
}

console.log('\nDecrypted results:')
console.log(JSON.stringify(decrypted.data, null, 2))
```

**Key Points:**
- Use standard Drizzle operators (`.eq()`, `.gte()`, `.lte()`, `like`/`ilike`) for searches
- For LIKE/ILIKE, set `returnType: 'composite-literal'` and pass the term directly
- Sorting with ORE on Supabase may require `orderBy(asc(sql\`eql_v2.order_by(column)\`))`
- Always handle search term creation failures
- Use `bulkDecryptModels()` for decrypting multiple results

**Note on ORM Differences:**
- **Supabase**: Can use `.eq()` directly with search terms as Supabase handles the SQL function mapping internally
- **Drizzle ORM with Custom Types**: Use standard operators; for LIKE/ILIKE specify `returnType: 'composite-literal'`
- **Drizzle ORM without Custom Types**: May require explicit SQL functions for equality/range
- **Other ORMs**: May require different approaches depending on their query builder capabilities

### Pitfalls and Type Notes

- TypeScript may not infer types for composite literals; you may need `// @ts-ignore` when passing `searchTerm.data[0]` to `like/ilike`.
- Equality and numeric range terms do not require `returnType` with the custom `encrypted` type.
- On Supabase Postgres, ordering by encrypted columns may require `sql` with `eql_v2.order_by(column)`.

### User Management System

```typescript
// protect/schema.ts
import { csTable, csColumn, csValue } from '@cipherstash/schema'

export const users = csTable('users', {
  email: csColumn('email')
    .freeTextSearch()
    .equality()
    .orderAndRange(),
  age: csColumn('age')
    .dataType('number')
    .equality()
    .orderAndRange(),
  // Nested fields use csValue (not searchable)
  profile: {
    name: csValue('profile.name'),
    bio: csValue('profile.bio'),
    score: csValue('profile.score').dataType('number'),
  }
})

// db/schema.ts
import { pgTable, serial, jsonb, varchar } from 'drizzle-orm/pg-core'

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: jsonb('email').notNull(),
  age: jsonb('age'),
  profile: jsonb('profile'),
  createdAt: varchar('created_at', { length: 255 }).notNull(),
})

// services/userService.ts
import { protectClient, users as protectUsers } from '../protect/schema'
import { db, users } from '../db/schema'
import { eq, like, gte, lte, asc, and } from 'drizzle-orm'

export class UserService {
  async createUser(userData: {
    email: string
    age: number
    profile: {
      name: string
      bio: string
      score: number
    }
  }) {
    // Encrypt user data
    const encrypted = await protectClient.encryptModel(userData, protectUsers)
    if (encrypted.failure) {
      throw new Error(`Encryption failed: ${encrypted.failure.message}`)
    }
    
    // Insert into database
    const [user] = await db.insert(users).values({
      email: encrypted.data.email,
      age: encrypted.data.age,
      profile: encrypted.data.profile,
      createdAt: new Date().toISOString(),
    }).returning()
    
    return user
  }
  
  async getUserById(id: number) {
    const [user] = await db.select().from(users).where(eq(users.id, id))
    if (!user) return null
    
    // Decrypt user data
    const decrypted = await protectClient.decryptModel(user)
    if (decrypted.failure) {
      throw new Error(`Decryption failed: ${decrypted.failure.message}`)
    }
    
    return decrypted.data
  }
  
  async searchUsers(query: string, minAge?: number, maxAge?: number) {
    let whereConditions = []
    
    // Text search
    if (query) {
      const searchTerm = await protectClient.createSearchTerms([{
        value: query,
        column: protectUsers.email,
        table: protectUsers,
      }])
      
      if (searchTerm.failure) {
        throw new Error(`Search term creation failed: ${searchTerm.failure.message}`)
      }
      
      whereConditions.push(
        like(users.email, `%${searchTerm.data[0]}%`)
      )
    }
    
    // Age range
    if (minAge !== undefined) {
      const minAgeTerm = await protectClient.createSearchTerms([{
        value: minAge,
        column: protectUsers.age,
        table: protectUsers,
      }])
      
      if (minAgeTerm.failure) {
        throw new Error(`Min age search term creation failed: ${minAgeTerm.failure.message}`)
      }
      
      whereConditions.push(
        gte(users.age, minAgeTerm.data[0])
      )
    }
    
    if (maxAge !== undefined) {
      const maxAgeTerm = await protectClient.createSearchTerms([{
        value: maxAge,
        column: protectUsers.age,
        table: protectUsers,
      }])
      
      if (maxAgeTerm.failure) {
        throw new Error(`Max age search term creation failed: ${maxAgeTerm.failure.message}`)
      }
      
      whereConditions.push(
        lte(users.age, maxAgeTerm.data[0])
      )
    }
    
    // Execute query
    const results = await db
      .select()
      .from(users)
      .where(whereConditions.length > 0 ? and(...whereConditions) : undefined)
      .orderBy(asc(users.age))
    
    // Decrypt results
    const decryptedResults = await protectClient.bulkDecryptModels(results)
    if (decryptedResults.failure) {
      throw new Error(`Bulk decryption failed: ${decryptedResults.failure.message}`)
    }
    
    return decryptedResults.data
  }
}
```

## Best Practices

### 1. Schema Design

- **Use JSONB columns** for encrypted data in PostgreSQL
- **Define search capabilities** at schema level
- **Keep sensitive fields separate** from non-sensitive ones
- **Use consistent naming** between Protect.js and Drizzle schemas
- **Choose the right approach**:
  - **JSONB approach**: Simpler setup, good for prototyping and smaller applications
  - **Custom type approach**: Better type safety, cleaner code, recommended for production applications

### 2. Error Handling

- **Always check for failures** in encryption/decryption operations
- **Log errors appropriately** without exposing sensitive data
- **Use try-catch blocks** for database operations
- **Implement retry logic** for transient failures

### 3. Performance

- **Use bulk operations** when possible
- **Index encrypted columns** appropriately
- **Consider query complexity** for search operations
- **Cache frequently accessed data** when appropriate

### 4. Security

- **Never log plaintext data**
- **Use environment variables** for sensitive configuration
- **Implement proper access controls**
- **Regularly rotate encryption keys**

### 5. Type Safety

- **Use Drizzle's type inference** for database models
- **Create custom types** for encrypted data
- **Validate data** before encryption
- **Use TypeScript strict mode**

This comprehensive guide provides everything you need to integrate Protect.js with Drizzle ORM effectively. The combination offers powerful type safety, searchable encryption, and seamless database operations for secure applications.
