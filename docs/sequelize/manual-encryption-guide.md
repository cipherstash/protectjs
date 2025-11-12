# Manual Encryption Guide (Without Hooks)

> ## ⚠️ Advanced Guide - Most Users Should Use Hooks
>
> **This guide is for advanced use cases only.** If you're new to this package or building standard applications, you should use the automatic hooks approach instead.
>
> **👉 See [README.md](./README.md) for the recommended hooks-based approach.**

## Why This Guide Exists

This package supports two approaches:

1. **✅ Automatic (Hooks)** - Recommended for 95% of use cases
2. **⚠️ Manual (No Hooks)** - Advanced users only

**Why manual encoding exists:**

Sequelize v6's architecture has a fundamental limitation: custom DataTypes cannot intercept WHERE clause transformation. By the time DataType methods run, the QueryGenerator has already processed WHERE clauses into SQL. This means we cannot make encryption "invisible" at the DataType level.

**The solution:** Hooks intercept at the right point in Sequelize's lifecycle (`beforeFind`/`afterFind`), before the QueryGenerator runs. This gives us transparent encryption for standard Sequelize operations.

**The trade-off:** Hooks don't work with raw SQL queries (`sequelize.query()`). Manual encoding gives power users direct control when they need to work outside the hook system.

**This is a proven pattern:** Other Sequelize encryption libraries (sequelize-encrypted, etc.) use the same hook-based approach. It's the standard way to add transparent encryption to ORMs.

## Why Use Manual Encryption?

**Use manual encryption only when:**
- ✅ You're working with raw SQL queries (hooks don't work)
- ✅ You need to optimize/batch encryption operations
- ✅ You're debugging encryption issues
- ✅ You need custom encryption workflows
- ✅ You want fine-grained control over encryption timing

**Use hooks for everything else:**
- ✅ Standard CRUD operations (recommended)
- ✅ Building APIs or GraphQL resolvers
- ✅ Normal Sequelize queries
- ✅ When you want simple, safe, transparent encryption

## Complete Manual Workflow

### Step 1: Define Model (No Hooks)

```typescript
import { Sequelize, DataTypes, Model } from 'sequelize'
import { createEncryptedType } from '@cipherstash/sequelize'

const sequelize = new Sequelize(DATABASE_URL, { dialect: 'postgres' })

// Create ENCRYPTED type
const ENCRYPTED = createEncryptedType()

// Define model with encrypted columns
class User extends Model {
  declare id: number
  declare email: string  // Will be encrypted
  declare age: number    // Will be encrypted
  declare name: string   // Not encrypted
}

User.init(
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    email: ENCRYPTED('email', {
      equality: true,
      freeTextSearch: true,
    }),
    age: ENCRYPTED('age', {
      equality: true,
      orderAndRange: true,
    }),
    name: DataTypes.STRING, // Not encrypted
  },
  {
    sequelize,
    tableName: 'users',
  }
)

// ❌ DO NOT add hooks
// addProtectHooks(User, protectClient)
```

### Step 2: Initialize Protect Client

```typescript
import { protect } from '@cipherstash/protect'
import { extractProtectSchema } from '@cipherstash/sequelize'

// Extract schema from model
const userTable = extractProtectSchema(User)

// Initialize Protect client
const protectClient = await protect({
  schemas: [userTable],
})
```

### Step 3: Manual INSERT (Create)

```typescript
import { toComposite } from '@cipherstash/sequelize'

async function createUser(email: string, age: number, name: string) {
  // 1. Manually encrypt values
  const encryptedEmail = await protectClient.encrypt(email, {
    table: userTable,
    column: userTable.email,
  })

  const encryptedAge = await protectClient.encrypt(age, {
    table: userTable,
    column: userTable.age,
  })

  // 2. Convert to composite type format
  const emailStringified = toComposite(encryptedEmail.data)
  const ageStringified = toComposite(encryptedAge.data)

  // 3. Insert with stringified values
  const user = await User.create({
    email: emailStringified,
    age: ageStringified,
    name, // Not encrypted
  })

  return user
}

// Usage
const user = await createUser('alice@example.com', 30, 'Alice')
console.log(user.id) // 1
// Note: email and age are still encrypted in the instance!
```

### Step 4: Manual SELECT (Read)

```typescript
import { Op } from 'sequelize'
import { toComposite, bulkFromComposite } from '@cipherstash/sequelize'

async function findUserByEmail(email: string) {
  // 1. Encrypt search value
  const encryptedEmail = await protectClient.encrypt(email, {
    table: userTable,
    column: userTable.email,
  })

  // 2. Convert to composite format for WHERE clause
  const emailStringified = toComposite(encryptedEmail.data)

  // 3. Query with stringified value
  const user = await User.findOne({
    where: { email: emailStringified },
  })

  if (!user) return null

  // 4. Parse composite types and decrypt (ergonomic approach)
  const parsed = bulkFromComposite([user])
  const decrypted = await protectClient.bulkDecryptModels(parsed)

  if (decrypted.failure) {
    throw new Error(`Decryption failed: ${decrypted.failure.message}`)
  }

  return decrypted.data[0]
}

// Usage
const user = await findUserByEmail('alice@example.com')
console.log(user)
// {
//   id: 1,
//   email: 'alice@example.com',  // Decrypted!
//   age: 30,                      // Decrypted!
//   name: 'Alice'
// }
```

### Step 5: Manual SELECT with Operators

```typescript
import { Op } from 'sequelize'
import { toComposite, bulkFromComposite } from '@cipherstash/sequelize'

async function findUsersByAgeRange(minAge: number, maxAge: number) {
  // 1. Encrypt range values
  const encryptedMin = await protectClient.encrypt(minAge, {
    table: userTable,
    column: userTable.age,
  })

  const encryptedMax = await protectClient.encrypt(maxAge, {
    table: userTable,
    column: userTable.age,
  })

  // 2. Stringify for WHERE clause
  const minStringified = toComposite(encryptedMin.data)
  const maxStringified = toComposite(encryptedMax.data)

  // 3. Query with range operator
  const users = await User.findAll({
    where: {
      age: {
        [Op.between]: [minStringified, maxStringified],
      },
    },
  })

  // 4. Parse composite types and decrypt (ergonomic approach)
  const parsed = bulkFromComposite(users)
  const decrypted = await protectClient.bulkDecryptModels(parsed)

  if (decrypted.failure) {
    throw new Error(`Decryption failed: ${decrypted.failure.message}`)
  }

  return decrypted.data
}

// Usage
const users = await findUsersByAgeRange(25, 35)
console.log(users)
// [
//   { id: 1, email: 'alice@example.com', age: 30, name: 'Alice' },
//   { id: 2, email: 'bob@example.com', age: 28, name: 'Bob' },
// ]
```

### Step 6: Manual SELECT with Op.in

```typescript
import { Op } from 'sequelize'
import { bulkToComposite, bulkFromComposite } from '@cipherstash/sequelize'

async function findUsersByEmails(emails: string[]) {
  // 1. Bulk encrypt all email values
  const encryptedEmails = await Promise.all(
    emails.map(email =>
      protectClient.encrypt(email, {
        table: userTable,
        column: userTable.email,
      })
    )
  )

  // 2. Bulk stringify for WHERE clause
  const stringified = bulkToComposite(
    encryptedEmails.map(e => e.data)
  )

  // 3. Query with Op.in
  const users = await User.findAll({
    where: {
      email: { [Op.in]: stringified },
    },
  })

  // 4. Parse composite types and decrypt (ergonomic approach)
  const parsed = bulkFromComposite(users)
  const decrypted = await protectClient.bulkDecryptModels(parsed)

  return decrypted.failure ? [] : decrypted.data
}

// Usage
const users = await findUsersByEmails([
  'alice@example.com',
  'bob@example.com',
  'charlie@example.com',
])
```

### Step 7: Manual UPDATE

```typescript
async function updateUserAge(userId: number, newAge: number) {
  // 1. Encrypt new value
  const encryptedAge = await protectClient.encrypt(newAge, {
    table: userTable,
    column: userTable.age,
  })

  // 2. Stringify for update
  const ageStringified = toComposite(encryptedAge.data)

  // 3. Update
  await User.update(
    { age: ageStringified },
    { where: { id: userId } }
  )
}

// Usage
await updateUserAge(1, 31)
```

### Step 8: Raw SQL Queries

```typescript
import { fromComposite } from '@cipherstash/sequelize'

async function rawQuery() {
  // Execute raw SQL
  const [rows] = await sequelize.query(
    'SELECT id, email, age, name FROM users LIMIT 10'
  )

  // Parse encrypted fields from composite type
  const parsed = rows.map((row: any) => ({
    id: row.id,
    email: fromComposite(row.email),
    age: fromComposite(row.age),
    name: row.name,
  }))

  // Decrypt
  const decrypted = await protectClient.bulkDecryptModels(parsed)

  return decrypted.failure ? [] : decrypted.data
}

// Usage
const users = await rawQuery()
console.log(users)
```

## Helper Functions for Manual Approach

Create reusable helpers to reduce boilerplate:

```typescript
import {
  toComposite,
  fromComposite,
  bulkToComposite
} from '@cipherstash/sequelize'

// Helper: Encrypt and stringify single value
async function encryptForQuery(
  value: any,
  column: any,
  table: any
): Promise<string> {
  const encrypted = await protectClient.encrypt(value, { column, table })

  if (encrypted.failure) {
    throw new Error(`Encryption failed: ${encrypted.failure.message}`)
  }

  return toComposite(encrypted.data)
}

// Helper: Encrypt and stringify array of values
async function encryptArrayForQuery(
  values: any[],
  column: any,
  table: any
): Promise<string[]> {
  const encrypted = await Promise.all(
    values.map(v => protectClient.encrypt(v, { column, table }))
  )

  return bulkToComposite(encrypted.map(e => e.data))
}

// Helper: Parse and decrypt results (RECOMMENDED: Use bulkFromComposite instead)
async function decryptResults<T>(models: any[]): Promise<T[]> {
  // Modern ergonomic approach (recommended):
  const parsed = bulkFromComposite(models)
  const decrypted = await protectClient.bulkDecryptModels(parsed)

  if (decrypted.failure) {
    throw new Error(`Decryption failed: ${decrypted.failure.message}`)
  }

  return decrypted.data as T[]
}

// Usage with helpers
async function findUserByEmailSimplified(email: string) {
  const emailEncrypted = await encryptForQuery(
    email,
    userTable.email,
    userTable
  )

  const users = await User.findAll({
    where: { email: emailEncrypted },
  })

  return await decryptResults(users)
}
```

## Comparison: Manual vs Hooks

### Manual Approach

```typescript
// ❌ More code
async function findUser(email: string) {
  // 1. Encrypt
  const encrypted = await protectClient.encrypt(email, {...})
  const stringified = toComposite(encrypted.data)

  // 2. Query
  const user = await User.findOne({ where: { email: stringified } })

  // 3. Parse
  const plain = user.get({ plain: true })
  const parsed = {
    email: fromComposite(plain.email),
    age: fromComposite(plain.age),
  }

  // 4. Decrypt
  const decrypted = await protectClient.bulkDecryptModels([parsed])
  return decrypted.data[0]
}
```

**Pros:**
- ✅ Full control over encryption timing
- ✅ Can optimize encryption calls
- ✅ No "magic" automatic behavior
- ✅ Easier to debug

**Cons:**
- ❌ More boilerplate code
- ❌ Easy to forget encryption/decryption steps
- ❌ More opportunities for errors

### Hooks Approach

```typescript
// ✅ Simple!
async function findUser(email: string) {
  const user = await User.findOne({
    where: { email } // Automatically encrypted
  })

  return user // Automatically decrypted
}
```

**Pros:**
- ✅ Simple, minimal code
- ✅ Transparent encryption/decryption
- ✅ Harder to misuse
- ✅ Standard ORM patterns

**Cons:**
- ❌ "Magic" automatic behavior
- ❌ Less control over encryption timing
- ❌ Hooks fire for all operations

## When to Use Each Approach

### Use Manual Encryption

**Scenario 1: Performance Optimization**

```typescript
// Need to encrypt once, use in multiple queries
const encrypted = await protectClient.encrypt(email, {...})
const stringified = toComposite(encrypted.data)

// Reuse encrypted value in multiple queries
const user1 = await User.findOne({ where: { email: stringified } })
const user2 = await UserBackup.findOne({ where: { email: stringified } })
```

**Scenario 2: Raw SQL**

```typescript
// Hooks don't work with raw SQL
const [rows] = await sequelize.query('SELECT * FROM users WHERE email = ?', {
  replacements: [stringified]
})
```

**Scenario 3: Gradual Migration**

```typescript
// Migrate one query at a time
// Old code without encryption continues to work
// New code uses manual encryption
```

**Scenario 4: Custom Encryption Logic**

```typescript
// Apply custom logic before/after encryption
const value = preprocessValue(rawValue)
const encrypted = await protectClient.encrypt(value, {...})
const stringified = toComposite(encrypted.data)
```

### Use Hooks

**Scenario 1: Standard CRUD API**

```typescript
// Simple REST endpoints
app.post('/users', async (req, res) => {
  const user = await User.create(req.body) // Auto-encrypt
  res.json(user) // Auto-decrypt
})
```

**Scenario 2: GraphQL Resolvers**

```typescript
// Transparent in resolvers
const resolvers = {
  Query: {
    user: (_, { id }) => User.findByPk(id), // Auto-decrypt
  },
  Mutation: {
    createUser: (_, { input }) => User.create(input), // Auto-encrypt
  },
}
```

**Scenario 3: New Projects**

Start with hooks for simplicity, optimize later if needed.

## Mixing Both Approaches

You can use both approaches in the same application:

```typescript
// Add hooks for most operations
addProtectHooks(User, protectClient)

// But use manual encryption for special cases
async function customQuery() {
  // Manual encryption for this specific query
  const encrypted = await protectClient.encrypt(value, {...})
  const stringified = toComposite(encrypted.data)

  const [rows] = await sequelize.query(
    'SELECT * FROM users WHERE email = ?',
    { replacements: [stringified] }
  )

  // Manual decryption
  const parsed = rows.map(r => ({
    email: fromComposite(r.email),
    age: fromComposite(r.age),
  }))

  const decrypted = await protectClient.bulkDecryptModels(parsed)
  return decrypted.data
}
```

## Complete Example: Manual CRUD

```typescript
import { Sequelize, DataTypes, Model, Op } from 'sequelize'
import { protect } from '@cipherstash/protect'
import {
  createEncryptedType,
  extractProtectSchema,
  toComposite,
  fromComposite,
  bulkToComposite,
} from '@cipherstash/sequelize'

// Initialize
const sequelize = new Sequelize(DATABASE_URL, { dialect: 'postgres' })
const ENCRYPTED = createEncryptedType()

// Define model (no hooks)
class User extends Model {
  declare id: number
  declare email: string
  declare age: number
}

User.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    email: ENCRYPTED('email', { equality: true }),
    age: ENCRYPTED('age', { orderAndRange: true }),
  },
  { sequelize, tableName: 'users' }
)

// Initialize Protect
const userTable = extractProtectSchema(User)
const protectClient = await protect({ schemas: [userTable] })

// CREATE
async function createUser(email: string, age: number) {
  const [encEmail, encAge] = await Promise.all([
    protectClient.encrypt(email, { table: userTable, column: userTable.email }),
    protectClient.encrypt(age, { table: userTable, column: userTable.age }),
  ])

  return await User.create({
    email: toComposite(encEmail.data),
    age: toComposite(encAge.data),
  })
}

// READ
async function findUserByEmail(email: string) {
  const encrypted = await protectClient.encrypt(email, {
    table: userTable,
    column: userTable.email,
  })

  const user = await User.findOne({
    where: { email: toComposite(encrypted.data) },
  })

  if (!user) return null

  const plain = user.get({ plain: true })
  const parsed = {
    id: plain.id,
    email: fromComposite(plain.email),
    age: fromComposite(plain.age),
  }

  const decrypted = await protectClient.bulkDecryptModels([parsed])
  return decrypted.data[0]
}

// UPDATE
async function updateUserAge(id: number, newAge: number) {
  const encrypted = await protectClient.encrypt(newAge, {
    table: userTable,
    column: userTable.age,
  })

  await User.update(
    { age: toComposite(encrypted.data) },
    { where: { id } }
  )
}

// DELETE
async function deleteUser(id: number) {
  await User.destroy({ where: { id } })
}

// Usage
const user = await createUser('alice@example.com', 30)
const found = await findUserByEmail('alice@example.com')
await updateUserAge(found.id, 31)
await deleteUser(found.id)
```

## Summary

**Hooks are NOT required. You have full control.**

### Two Approaches:

| Aspect | Manual | Hooks |
|--------|--------|-------|
| **Control** | ✅ Full control | ❌ Automatic |
| **Code** | ❌ More boilerplate | ✅ Minimal |
| **Safety** | ❌ Easy to forget steps | ✅ Automatic |
| **Debugging** | ✅ Explicit flow | ❌ "Magic" |
| **Raw SQL** | ✅ Works | ❌ Doesn't work |
| **Performance** | ✅ Can optimize | ❌ Fixed |

### Utilities for Manual Approach:

```typescript
import {
  toComposite,     // Encode for queries
  fromComposite,         // Decode from queries
  bulkToComposite, // Bulk encode
  bulkFromComposite,     // Bulk decode
} from '@cipherstash/sequelize'
```

**Choose based on your needs:**
- Want simplicity? → Use hooks
- Want control? → Use manual encryption
- Want both? → Mix approaches

Both approaches are fully supported and tested! 🚀
