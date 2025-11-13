# @cipherstash/sequelize

CipherStash Protect.js integration for Sequelize ORM - add searchable encryption to your PostgreSQL database with transparent encryption hooks.

[![npm version](https://img.shields.io/npm/v/@cipherstash/sequelize.svg)](https://www.npmjs.com/package/@cipherstash/sequelize)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

## Overview

`@cipherstash/sequelize` enables **searchable encryption** in your Sequelize models using CipherStash Protect.js. Each field is encrypted with its own unique key, and you can still query encrypted data with equality, range, and text search operations.

### Why This Package?

- 🔒 **Transparent Encryption** - Automatic encryption/decryption via Sequelize lifecycle hooks
- 🔍 **Searchable Encryption** - Query encrypted data without decrypting it first
- 🎯 **Type Safe** - Full TypeScript support with Sequelize model types
- ⚡ **Zero Migration** - Works with existing `eql_v2_encrypted` PostgreSQL columns
- 🔑 **Per-Value Keys** - Every encrypted value gets its own unique encryption key
- 🔌 **Flexible** - Use hooks (automatic) OR manual encoding (full control)

### Two Integration Approaches

**✅ Recommended: Automatic Hooks (95% of use cases)**
```typescript
addProtectHooks(User, protectClient)

// Query with plaintext - hooks handle encryption automatically
const user = await User.findOne({
  where: { email: 'alice@example.com' }
})
console.log(user.email) // Automatically decrypted
```

**⚠️ Advanced: Manual Encoding (raw SQL, performance optimization)**
```typescript
import { toComposite, fromComposite } from '@cipherstash/sequelize'

// Manually encrypt for raw SQL queries
const encrypted = await protectClient.createSearchTerms([{
  value: 'alice@example.com',
  column: userSchema.email,
  table: userSchema,
}])

const [results] = await sequelize.query(
  'SELECT * FROM users WHERE email = :email',
  { replacements: { email: toComposite(encrypted.data[0]) } }
)

// Parse and decrypt results
const parsed = results.map(row => ({ ...row, email: fromComposite(row.email) }))
const decrypted = await protectClient.bulkDecryptModels(parsed)

// See "Raw SQL with Manual Encryption" section for complete example
```

## Installation

```bash
npm install @cipherstash/sequelize @cipherstash/protect @cipherstash/schema sequelize
```

### Prerequisites

- **PostgreSQL 14+** with [EQL extension](https://github.com/cipherstash/encrypt-query-language) installed
- **Sequelize 6.x**
- **Node.js 18+**
- **CipherStash account** - [Sign up for free](https://cipherstash.com/signup)

### Install EQL Extension

The EQL extension provides the `eql_v2_encrypted` PostgreSQL composite type for storing encrypted data.

```bash
# Download the latest EQL installation script
curl -sLo cipherstash-encrypt.sql https://github.com/cipherstash/encrypt-query-language/releases/latest/download/cipherstash-encrypt.sql

# Install in your PostgreSQL database
psql -f cipherstash-encrypt.sql
```

For Supabase users:
```bash
curl -sLo cipherstash-encrypt-supabase.sql https://github.com/cipherstash/encrypt-query-language/releases/latest/download/cipherstash-encrypt-supabase.sql
psql -f cipherstash-encrypt-supabase.sql
```

**Verify installation:**
```typescript
import { ensureEqlType } from '@cipherstash/sequelize'

await ensureEqlType(sequelize)  // Throws if EQL not installed
```

## Quick Start

### 1. Set Up CipherStash

Sign up at [cipherstash.com/signup](https://cipherstash.com/signup) and create a workspace. You'll receive these credentials:

```bash
# .env
CS_WORKSPACE_CRN=your_workspace_crn
CS_CLIENT_ID=your_client_id
CS_CLIENT_KEY=your_client_key
CS_CLIENT_ACCESS_KEY=your_access_key

# Database connection
DATABASE_URL=postgresql://user:password@localhost:5432/mydb
```

### 2. Define Your Model with Encrypted Columns

```typescript
import { Sequelize, DataTypes, Model } from 'sequelize'
import { createEncryptedType, addProtectHooks } from '@cipherstash/sequelize'
import { protect } from '@cipherstash/protect'

// Initialize Sequelize
const sequelize = new Sequelize(process.env.DATABASE_URL!, {
  dialect: 'postgres',
  logging: false,
})

// Create ENCRYPTED data type factory
const ENCRYPTED = createEncryptedType()

// Define your model
class User extends Model {
  declare id: number
  declare email: string
  declare age: number
  declare salary: number
}

User.init(
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    email: ENCRYPTED('email', {
      equality: true,              // Enable exact match queries
      freeTextSearch: true,        // Enable LIKE/ILIKE queries
      dataType: 'string',
    }),
    age: ENCRYPTED('age', {
      orderAndRange: true,         // Enable range queries (>, <, BETWEEN)
      equality: true,              // Enable exact match
      dataType: 'number',
    }),
    salary: ENCRYPTED('salary', {
      orderAndRange: true,
      dataType: 'number',
    }),
  },
  {
    sequelize,
    tableName: 'users',
  }
)
```

### 3. Initialize Protect and Add Hooks

```typescript
import { extractProtectSchema } from '@cipherstash/sequelize'

// Extract Protect.js schema from Sequelize model
const userSchema = extractProtectSchema(User)

// Initialize Protect client
const protectClient = await protect({
  schemas: [userSchema],
})

// Add encryption hooks to the model
addProtectHooks(User, protectClient)
```

### 4. Create Database Table

```sql
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email eql_v2_encrypted NOT NULL,
  age eql_v2_encrypted,
  salary eql_v2_encrypted
);
```

Or use Sequelize sync (in development):
```typescript
await sequelize.sync({ force: true })  // Creates tables
```

### 5. Use Your Encrypted Model

```typescript
// Create - automatic encryption
const user = await User.create({
  email: 'alice@example.com',
  age: 30,
  salary: 120000,
})

// Query - automatic encryption of WHERE clause
const found = await User.findOne({
  where: { email: 'alice@example.com' }
})

// Results are automatically decrypted
console.log(found.email)   // "alice@example.com"
console.log(found.age)     // 30
console.log(found.salary)  // 120000
```

## Usage Patterns

### Using Hooks (Recommended - Idiomatic Approach)

Hooks provide transparent encryption/decryption, just like other ORM encryption libraries.

```typescript
import { addProtectHooks } from '@cipherstash/sequelize'

// Add hooks once during initialization
addProtectHooks(User, protectClient)

// Now all queries work transparently
await User.create({ email: 'bob@example.com', age: 25 })

const users = await User.findAll({
  where: {
    age: { [Op.gte]: 21 }
  }
})
// Results automatically decrypted
```

**Hooks installed:**
- `beforeFind` - Encrypts WHERE clause values before query
- `afterFind` - Decrypts results after query
- `beforeSave` - Encrypts values before INSERT/UPDATE
- `beforeBulkCreate` - Encrypts values before bulk INSERT
- `afterBulkCreate` - Decrypts returned values after bulk INSERT

### Using Direct Encryption (Advanced)

For advanced use cases like raw SQL, custom batching, or debugging:

```typescript
import { Op } from 'sequelize'
import { toComposite } from '@cipherstash/sequelize'
import { extractProtectSchema } from '@cipherstash/sequelize'

// Extract schema for manual operations
const userSchema = extractProtectSchema(User)

// Encrypt a value
const encrypted = await protectClient.encrypt('alice@example.com', {
  table: userSchema,
  column: userSchema.email,
})

// Convert to PostgreSQL composite type format
const composite = toComposite(encrypted.data)

// Query with encrypted value
const user = await User.findOne({
  where: { email: composite }
})

// Manually decrypt result
const decrypted = await protectClient.decrypt(user.email)
console.log(decrypted.data)  // "alice@example.com"
```

### Bulk Operations with Helper Functions

For ergonomic bulk decryption similar to Drizzle:

```typescript
import { bulkFromComposite } from '@cipherstash/sequelize'

// Query returns models with encrypted fields
const users = await User.findAll()

// Parse composite type fields automatically
const parsed = bulkFromComposite(users)

// Decrypt all models at once
const decrypted = await protectClient.bulkDecryptModels(parsed)

console.log(decrypted.data[0].email)  // "alice@example.com"
console.log(decrypted.data[1].email)  // "bob@example.com"
```

## API Documentation

### Data Type Creation

#### `createEncryptedType()`

Creates a factory function for defining encrypted columns.

```typescript
function createEncryptedType(): EncryptedTypeFactory
```

**Returns:** Factory function to create ENCRYPTED column definitions

**Usage:**
```typescript
const ENCRYPTED = createEncryptedType()

// Use the factory to define columns
email: ENCRYPTED('email', { equality: true })
```

**Important:** Call once per application and reuse the returned factory.

---

### Column Configuration

#### `ENCRYPTED(columnName, config)`

Define an encrypted column with searchable indexes.

```typescript
ENCRYPTED(
  columnName: string,
  config: EncryptedColumnConfig
): DataType
```

**Parameters:**

- `columnName` - Name of the column
- `config` - Configuration object:
  - `dataType?: 'string' | 'number' | 'json'` - Data type (default: 'string')
  - `equality?: boolean | TokenFilter[]` - Enable exact match queries
  - `orderAndRange?: boolean` - Enable range queries (>, <, BETWEEN)
  - `freeTextSearch?: boolean | MatchIndexOpts` - Enable LIKE/ILIKE queries

**Examples:**

```typescript
// String with equality (case-insensitive)
email: ENCRYPTED('email', {
  equality: [{ kind: 'downcase' }],
  dataType: 'string',
})

// Number with range queries
age: ENCRYPTED('age', {
  orderAndRange: true,
  equality: true,
  dataType: 'number',
})

// Text search
bio: ENCRYPTED('bio', {
  freeTextSearch: {
    tokenFilters: [{ kind: 'downcase' }],
    tokenizer: { kind: 'standard' },
  },
  dataType: 'string',
})

// JSON (opaque encryption, no search)
profile: ENCRYPTED('profile', {
  dataType: 'json',
})
```

**Index Requirements:**
- `equality: true` required for: `Op.eq`, `Op.ne`, `Op.in`, `Op.notIn`, simple equality
- `orderAndRange: true` required for: `Op.gt`, `Op.gte`, `Op.lt`, `Op.lte`, `Op.between`
- `freeTextSearch: true` required for: `Op.like`, `Op.iLike`, `Op.notLike`

---

### Hook Management

#### `addProtectHooks(model, protectClient)`

Install encryption hooks on a Sequelize model.

```typescript
function addProtectHooks<M extends Model>(
  model: ModelStatic<M>,
  protectClient: ProtectClient
): void
```

**Parameters:**

- `model` - Sequelize model class with ENCRYPTED columns
- `protectClient` - Initialized Protect.js client

**Hooks Installed:**

| Hook | When | What It Does |
|------|------|--------------|
| `beforeFind` | Before SELECT queries | Encrypts WHERE clause values |
| `afterFind` | After SELECT queries | Decrypts query results |
| `beforeSave` | Before INSERT/UPDATE | Encrypts field values |
| `beforeBulkCreate` | Before bulk INSERT | Encrypts all records |
| `afterBulkCreate` | After bulk INSERT with returning | Decrypts returned records |

**Example:**
```typescript
addProtectHooks(User, protectClient)

// Now all queries are transparent
const user = await User.findOne({
  where: { email: 'alice@example.com' }  // Automatically encrypted
})
console.log(user.email)  // Automatically decrypted
```

---

### Schema Extraction

#### `extractProtectSchema(model)`

Extract Protect.js schema from Sequelize model for manual operations.

```typescript
function extractProtectSchema<M extends Model>(
  model: ModelStatic<M>
): ProtectTable<ProtectTableColumn>
```

**Parameters:**

- `model` - Sequelize model with ENCRYPTED columns

**Returns:** Protect.js table schema

**Usage:**
```typescript
const userSchema = extractProtectSchema(User)

// Use for manual encryption
const encrypted = await protectClient.encrypt('value', {
  table: userSchema,
  column: userSchema.email,
})
```

#### `extractProtectSchemas(...models)`

Extract schemas from multiple models at once.

```typescript
function extractProtectSchemas(
  ...models: ModelStatic<any>[]
): ProtectTable<ProtectTableColumn>[]
```

**Example:**
```typescript
const schemas = extractProtectSchemas(User, Order, Payment)

const protectClient = await protect({ schemas })
```

---

### Composite Type Utilities (Manual Encoding)

**⚠️ Advanced feature** - Use hooks for standard operations. These utilities are for raw SQL, batch optimization, and debugging.

#### `toComposite(value)`

Convert encrypted object to PostgreSQL composite type string.

```typescript
function toComposite(value: any): string
```

**Parameters:**
- `value` - Encrypted object from `protectClient.encrypt()`

**Returns:** PostgreSQL composite type string: `("json_with_escaped_quotes")`

**Example:**
```typescript
import { Op } from 'sequelize'
import { toComposite } from '@cipherstash/sequelize'

const encrypted = await protectClient.encrypt(1000.00, {
  table: schema,
  column: schema.amount,
})

const composite = toComposite(encrypted.data)

const results = await Transaction.findAll({
  where: { amount: { [Op.gte]: composite } }
})
```

#### `fromComposite(value)`

Parse PostgreSQL composite type string back to encrypted object.

```typescript
function fromComposite(value: string): any
```

**Parameters:**
- `value` - PostgreSQL composite type string

**Returns:** Encrypted object ready for `protectClient.decrypt()`

**Example:**
```typescript
import { fromComposite } from '@cipherstash/sequelize'

// Raw query
const [raw] = await sequelize.query(
  'SELECT email FROM users WHERE id = ?',
  { replacements: [userId] }
)

// Parse and decrypt
const encrypted = fromComposite(raw.email)
const decrypted = await protectClient.decrypt(encrypted)
console.log(decrypted.data)  // "alice@example.com"
```

#### `bulkToComposite(values)`

Bulk convert for `Op.in` queries.

```typescript
function bulkToComposite(values: any[]): string[]
```

**Example:**
```typescript
import { bulkToComposite } from '@cipherstash/sequelize'

// Encrypt multiple emails
const encrypted = await Promise.all(
  emails.map(email => protectClient.encrypt(email, {...}))
)

// Convert for Op.in
const composite = bulkToComposite(encrypted.map(e => e.data))

await User.findAll({
  where: { email: { [Op.in]: composite } }
})
```

#### `bulkFromComposite(models)`

Ergonomic bulk parsing for `bulkDecryptModels` (similar to Drizzle API).

```typescript
function bulkFromComposite<T>(models: T[]): T[]
```

**Parameters:**
- `models` - Array of Sequelize model instances or plain objects

**Returns:** Array with composite type strings parsed to encrypted objects

**Example:**
```typescript
import { bulkFromComposite } from '@cipherstash/sequelize'

// Query returns models with composite type strings
const users = await User.findAll()

// Parse all encrypted fields automatically
const parsed = bulkFromComposite(users)

// Decrypt all models
const decrypted = await protectClient.bulkDecryptModels(parsed)
console.log(decrypted.data[0].email)  // "alice@example.com"
```

**Why use this?**
- ✅ Same ergonomic API as Drizzle's `bulkDecryptModels`
- ✅ Automatically detects and parses all encrypted fields
- ✅ No need to manually extract individual fields
- ✅ Works with nested objects and arrays

---

### Type Verification

#### `ensureEqlType(sequelize)` ⭐ Recommended

Verify EQL extension is installed (fail-fast).

```typescript
function ensureEqlType(sequelize: Sequelize): Promise<void>
```

**Throws:** Error if `eql_v2_encrypted` type doesn't exist

**Example:**
```typescript
import { ensureEqlType } from '@cipherstash/sequelize'

// Verify before syncing
await ensureEqlType(sequelize)
await sequelize.sync()
```

#### `verifyEqlType(sequelize)`

Check if EQL type exists (returns boolean).

```typescript
function verifyEqlType(sequelize: Sequelize): Promise<boolean>
```

**Returns:** `true` if type exists, `false` otherwise

**Example:**
```typescript
const hasEql = await verifyEqlType(sequelize)
if (!hasEql) {
  console.error('Install EQL extension first')
}
```

#### `getEqlTypeInfo(sequelize)`

Get detailed type information.

```typescript
function getEqlTypeInfo(sequelize: Sequelize): Promise<TypeInfo | null>
```

**Returns:** Type metadata or `null` if not found

---

## Examples

### Complete Application Example

```typescript
import { Sequelize, DataTypes, Model, Op } from 'sequelize'
import { protect } from '@cipherstash/protect'
import {
  createEncryptedType,
  addProtectHooks,
  extractProtectSchema,
  ensureEqlType,
} from '@cipherstash/sequelize'

// Initialize Sequelize
const sequelize = new Sequelize(process.env.DATABASE_URL!, {
  dialect: 'postgres',
  logging: false,
})

// Verify EQL extension is installed
await ensureEqlType(sequelize)

// Create ENCRYPTED type factory
const ENCRYPTED = createEncryptedType()

// Define Employee model
class Employee extends Model {
  declare id: number
  declare email: string
  declare name: string
  declare salary: number
  declare bio: string
}

Employee.init(
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    email: ENCRYPTED('email', {
      equality: [{ kind: 'downcase' }],  // Case-insensitive
      dataType: 'string',
    }),
    name: DataTypes.STRING,  // Not encrypted
    salary: ENCRYPTED('salary', {
      orderAndRange: true,
      dataType: 'number',
    }),
    bio: ENCRYPTED('bio', {
      freeTextSearch: true,
      dataType: 'string',
    }),
  },
  {
    sequelize,
    tableName: 'employees',
  }
)

// Initialize Protect client
const employeeSchema = extractProtectSchema(Employee)
const protectClient = await protect({ schemas: [employeeSchema] })

// Add encryption hooks
addProtectHooks(Employee, protectClient)

// Create table
await sequelize.sync()

// --- Usage Examples ---

// Create employee (automatic encryption)
await Employee.create({
  email: 'alice@example.com',
  name: 'Alice Johnson',
  salary: 150000,
  bio: 'Senior software engineer with 10 years experience',
})

// Find by email (case-insensitive, automatic)
const alice = await Employee.findOne({
  where: { email: 'ALICE@EXAMPLE.COM' }
})
console.log(alice?.email)  // "alice@example.com"

// Salary range query
const highEarners = await Employee.findAll({
  where: {
    salary: { [Op.gte]: 100000 }
  }
})

// Text search
const engineers = await Employee.findAll({
  where: {
    bio: { [Op.iLike]: '%engineer%' }
  }
})

// Combined conditions
const seniorEngineers = await Employee.findAll({
  where: {
    [Op.and]: [
      { bio: { [Op.iLike]: '%senior%' } },
      { salary: { [Op.gte]: 120000 } }
    ]
  }
})

// Multiple values
const team = await Employee.findAll({
  where: {
    email: {
      [Op.in]: ['alice@example.com', 'bob@example.com']
    }
  }
})
```

### Bulk Insert Example

```typescript
// Create multiple users at once
const users = await User.bulkCreate([
  { email: 'user1@example.com', age: 25, salary: 75000 },
  { email: 'user2@example.com', age: 30, salary: 90000 },
  { email: 'user3@example.com', age: 35, salary: 110000 },
], { returning: true })

// All records encrypted automatically via beforeBulkCreate hook
// Results decrypted automatically via afterBulkCreate hook
console.log(users[0].email)  // "user1@example.com"
```

### JSON Field Encryption Example

```typescript
const ENCRYPTED = createEncryptedType()

class User extends Model {
  declare id: number
  declare email: string
  declare profile: {
    name: string
    preferences: {
      theme: string
      notifications: boolean
    }
  }
}

User.init({
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  email: ENCRYPTED('email', { equality: true }),
  profile: ENCRYPTED('profile', { dataType: 'json' }),
}, { sequelize, tableName: 'users' })

// JSON fields are encrypted as opaque blobs
const user = await User.create({
  email: 'alice@example.com',
  profile: {
    name: 'Alice',
    preferences: {
      theme: 'dark',
      notifications: true,
    }
  }
})

// Retrieve - entire JSON decrypted
const found = await User.findByPk(user.id)
console.log(found.profile.name)  // "Alice"
console.log(found.profile.preferences.theme)  // "dark"
```

### Raw SQL with Manual Encryption

```typescript
import { toComposite, fromComposite } from '@cipherstash/sequelize'

// Encrypt value
const encrypted = await protectClient.createSearchTerms([{
  value: 'alice@example.com',
  column: userSchema.email,
  table: userSchema,
}])

const composite = toComposite(encrypted.data[0])

// Raw SQL query
const [results] = await sequelize.query(
  `SELECT * FROM users WHERE email = :email`,
  {
    replacements: { email: composite },
    type: 'SELECT',
  }
)

// Parse and decrypt
const parsed = results.map(row => ({
  ...row,
  email: fromComposite(row.email),
  age: fromComposite(row.age),
}))

const decrypted = await protectClient.bulkDecryptModels(parsed)
console.log(decrypted.data[0].email)  // "alice@example.com"
```

## Configuration

### Environment Variables

Required for CipherStash Protect.js:

```bash
# CipherStash credentials (from dashboard)
CS_WORKSPACE_CRN=workspace://your-workspace-id
CS_CLIENT_ID=your-client-id
CS_CLIENT_KEY=your-client-key-base64
CS_CLIENT_ACCESS_KEY=your-access-key

# Database connection
DATABASE_URL=postgresql://user:password@localhost:5432/mydb

# Optional: Protect.js logging
PROTECT_LOG_LEVEL=info  # debug | info | error
```

**Getting credentials:**
1. Sign up at [cipherstash.com/signup](https://cipherstash.com/signup)
2. Create a workspace
3. Generate client credentials
4. Copy to `.env` file

### Database Schema

Use `eql_v2_encrypted` type for encrypted columns:

```sql
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email eql_v2_encrypted NOT NULL,
  age eql_v2_encrypted,
  salary eql_v2_encrypted,
  name TEXT  -- Not encrypted
);
```

Or use Sequelize migrations:

```typescript
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('users', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      email: {
        type: 'eql_v2_encrypted',
        allowNull: false,
      },
      age: {
        type: 'eql_v2_encrypted',
      },
      name: {
        type: Sequelize.STRING,
      },
    })
  },
}
```

## Supported Query Operations

All Sequelize operators work transparently with hooks:

### Equality Operators

Requires `equality: true` in column config.

```typescript
// Simple equality
{ email: 'alice@example.com' }

// Op.eq
{ email: { [Op.eq]: 'alice@example.com' } }

// Op.ne (not equal)
{ email: { [Op.ne]: 'spam@example.com' } }

// Op.in
{ email: { [Op.in]: ['alice@example.com', 'bob@example.com'] } }

// Op.notIn
{ email: { [Op.notIn]: ['banned@example.com'] } }
```

### Range Operators

Requires `orderAndRange: true` in column config.

```typescript
// Greater than
{ age: { [Op.gt]: 18 } }

// Greater than or equal
{ salary: { [Op.gte]: 100000 } }

// Less than
{ age: { [Op.lt]: 65 } }

// Less than or equal
{ salary: { [Op.lte]: 200000 } }

// Between
{ age: { [Op.between]: [18, 65] } }

// Not between
{ salary: { [Op.notBetween]: [0, 50000] } }
```

### Text Search Operators

Requires `freeTextSearch: true` in column config.

```typescript
// LIKE
{ bio: { [Op.like]: '%engineer%' } }

// Case-insensitive LIKE
{ bio: { [Op.iLike]: '%ENGINEER%' } }

// NOT LIKE
{ bio: { [Op.notLike]: '%manager%' } }

// NOT ILIKE
{ bio: { [Op.notILike]: '%MANAGER%' } }
```

### Logical Operators

Combine conditions with AND/OR:

```typescript
// AND
{
  [Op.and]: [
    { email: 'alice@example.com' },
    { age: { [Op.gt]: 18 } }
  ]
}

// OR
{
  [Op.or]: [
    { email: 'alice@example.com' },
    { email: 'bob@example.com' }
  ]
}

// Complex nested
{
  [Op.and]: [
    { salary: { [Op.gte]: 100000 } },
    {
      [Op.or]: [
        { bio: { [Op.iLike]: '%senior%' } },
        { bio: { [Op.iLike]: '%lead%' } }
      ]
    }
  ]
}
```

## Testing

### Running Tests

```bash
# Install dependencies
npm install

# Set up test database
createdb sequelize_protect_test
psql sequelize_protect_test -f cipherstash-encrypt.sql

# Configure environment
cp .env.example .env
# Edit .env with your CS_* credentials and DATABASE_URL

# Run tests
npm test

# Watch mode
npm run test:watch
```

### Test Coverage

The package includes comprehensive E2E tests covering:

- ✅ Automatic encryption/decryption via hooks
- ✅ Equality searches (`Op.eq`, `Op.in`)
- ✅ Range queries (`Op.gt`, `Op.between`)
- ✅ Text search (`Op.like`, `Op.iLike`)
- ✅ Logical operators (`Op.and`, `Op.or`)
- ✅ Bulk operations (`bulkCreate`)
- ✅ JSON field encryption
- ✅ Composite type encoding/decoding
- ✅ Raw SQL queries
- ✅ Data verification (encrypted at rest)

### Example Test

```typescript
import { describe, it, expect, beforeAll } from 'vitest'

describe('Sequelize Protect Integration', () => {
  beforeAll(async () => {
    const ENCRYPTED = createEncryptedType()

    User.init({
      email: ENCRYPTED('email', { equality: true }),
    }, { sequelize })

    const schema = extractProtectSchema(User)
    const client = await protect({ schemas: [schema] })

    addProtectHooks(User, client)
    await sequelize.sync({ force: true })
  })

  it('encrypts and queries data transparently', async () => {
    await User.create({ email: 'test@example.com' })

    const user = await User.findOne({
      where: { email: 'test@example.com' }
    })

    expect(user?.email).toBe('test@example.com')
  })
})
```

## Troubleshooting

### "Column doesn't have equality index"

**Cause:** Using `Op.eq`, `Op.in`, or simple equality on a column without `equality: true`.

**Fix:**
```typescript
email: ENCRYPTED('email', {
  equality: true,  // Add this
  dataType: 'string',
})
```

### "Column doesn't have orderAndRange index"

**Cause:** Using `Op.gt`, `Op.lt`, `Op.between` on a column without `orderAndRange: true`.

**Fix:**
```typescript
age: ENCRYPTED('age', {
  orderAndRange: true,  // Add this
  dataType: 'number',
})
```

### "Column doesn't have freeTextSearch index"

**Cause:** Using `Op.like` or `Op.iLike` on a column without `freeTextSearch: true`.

**Fix:**
```typescript
bio: ENCRYPTED('bio', {
  freeTextSearch: true,  // Add this
  dataType: 'string',
})
```

### "PostgreSQL type 'eql_v2_encrypted' not found"

**Cause:** EQL extension not installed in PostgreSQL.

**Fix:**
```bash
# Download and install EQL extension
curl -sLo cipherstash-encrypt.sql https://github.com/cipherstash/encrypt-query-language/releases/latest/download/cipherstash-encrypt.sql
psql -f cipherstash-encrypt.sql
```

Verify:
```typescript
await ensureEqlType(sequelize)  // Throws if not installed
```

### "Encryption failed" or "Decryption failed"

**Possible causes:**
1. Invalid CipherStash credentials
2. Network connectivity to CipherStash API
3. Workspace permissions

**Debug steps:**
```bash
# Enable debug logging
PROTECT_LOG_LEVEL=debug npm start

# Verify credentials
echo $CS_WORKSPACE_CRN
echo $CS_CLIENT_ID
echo $CS_CLIENT_ACCESS_KEY
# Check CS_CLIENT_KEY is set (don't echo it)
```

**Check Protect client initialization:**
```typescript
try {
  const protectClient = await protect({ schemas: [schema] })
  console.log('✅ Protect client initialized')
} catch (error) {
  console.error('❌ Protect initialization failed:', error)
}
```

### TypeScript Errors with ENCRYPTED Type

**Problem:** Type errors when defining models.

**Fix:** Ensure you're calling `createEncryptedType()` once and reusing the factory:

```typescript
// ✅ Correct - create once, reuse
const ENCRYPTED = createEncryptedType()

User.init({
  email: ENCRYPTED('email', { equality: true }),
  age: ENCRYPTED('age', { orderAndRange: true }),
}, { sequelize })

// ❌ Wrong - creates new type each time
User.init({
  email: createEncryptedType()('email', { equality: true }),
}, { sequelize })
```

### Hooks Not Working

**Symptoms:** Queries return encrypted data or fail to find records.

**Checklist:**
1. ✅ Called `addProtectHooks(Model, protectClient)` after model definition
2. ✅ Using `User.findOne()`, `User.findAll()`, not raw queries
3. ✅ Hooks registered before any queries executed

**Verify hooks are installed:**
```typescript
addProtectHooks(User, protectClient)

// Check hooks exist
console.log(User.options.hooks)
// Should show: beforeFind, afterFind, beforeSave, etc.
```

### Raw Queries Not Working

**Cause:** Hooks only work with Sequelize model methods, not `sequelize.query()`.

**Fix:** Use manual encryption with `toComposite` / `fromComposite`:

```typescript
import { toComposite, fromComposite } from '@cipherstash/sequelize'

// Encrypt search value
const encrypted = await protectClient.createSearchTerms([{
  value: 'alice@example.com',
  column: schema.email,
  table: schema,
}])

const composite = toComposite(encrypted.data[0])

// Raw query
const [results] = await sequelize.query(
  'SELECT * FROM users WHERE email = :email',
  { replacements: { email: composite } }
)

// Decrypt results
const parsed = results.map(row => ({
  ...row,
  email: fromComposite(row.email),
}))

const decrypted = await protectClient.bulkDecryptModels(parsed)
```

## Migration from Direct Protect.js Usage

Switching from manual Protect.js to automated hooks:

**Before (manual encryption):**
```typescript
// Encrypt search term
const searchTerms = await protectClient.createSearchTerms([{
  value: 'alice@example.com',
  column: emailColumn,
  table: usersTable,
}])

// Query with encrypted value
const user = await User.findOne({
  where: { email: searchTerms.data[0] }
})

// Manually decrypt
const decrypted = await protectClient.bulkDecryptModels([
  user.get({ plain: true })
])
console.log(decrypted.data[0].email)
```

**After (automatic hooks):**
```typescript
// Just add hooks once
addProtectHooks(User, protectClient)

// Query normally
const user = await User.findOne({
  where: { email: 'alice@example.com' }
})

// Already decrypted
console.log(user.email)
```

## Performance Considerations

### Bulk Operations

Use `bulkCreate` for inserting multiple records:

```typescript
// ✅ Efficient - single ZeroKMS call
await User.bulkCreate(users, { returning: true })

// ❌ Inefficient - multiple ZeroKMS calls
for (const user of users) {
  await User.create(user)
}
```

### Query Optimization

Hooks add minimal overhead:

- **beforeFind:** Single encryption call per WHERE clause (even with `Op.in`)
- **afterFind:** Single bulk decryption call for all results
- **Network:** One round-trip to CipherStash per query

For 1000 records:
- Manual: 1 encryption call + 1 bulk decryption call
- Hooks: Same performance, but automatic

### Manual Encoding for Special Cases

Use manual encoding when:
- Running raw SQL queries
- Encrypting once, reusing across multiple queries
- Building custom query builders
- Optimizing specific hot paths

## Related Packages

- [@cipherstash/protect](https://www.npmjs.com/package/@cipherstash/protect) - Core Protect.js client
- [@cipherstash/schema](https://www.npmjs.com/package/@cipherstash/schema) - Schema definitions
- [sequelize](https://www.npmjs.com/package/sequelize) - Sequelize ORM
- [encrypt-query-language](https://github.com/cipherstash/encrypt-query-language) - PostgreSQL EQL extension

## Additional Documentation

- [Composite Type Utilities](../../docs/sequelize/composite-type-utilities.md) - Complete guide to manual encoding

## Support

- **Documentation:** [cipherstash.com/docs](https://cipherstash.com/docs)
- **GitHub Issues:** [github.com/cipherstash/protectjs/issues](https://github.com/cipherstash/protectjs/issues)
- **Community:** [cipherstash.com/community](https://cipherstash.com/community)
- **Email:** hello@cipherstash.com

## License

MIT

---

**Built with ❤️ by [CipherStash](https://cipherstash.com)**
