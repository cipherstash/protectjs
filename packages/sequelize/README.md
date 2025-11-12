# @cipherstash/sequelize

Sequelize integration for [Protect.js](https://github.com/cipherstash/protect-js) - add searchable encryption to your Sequelize models with transparent encryption hooks.

## Features

- 🔒 **Transparent Encryption** - Automatic encryption/decryption via Sequelize hooks
- 🔍 **Searchable Encryption** - Query encrypted data with equality, range, and text search
- 🎯 **Type Safe** - Full TypeScript support with Sequelize types
- ⚡ **Zero Migration** - Works with existing `eql_v2_encrypted` columns
- 🔌 **Flexible** - Use hooks (automatic) OR manual encryption (full control)

## Two Approaches

This package supports two approaches to encryption: **automatic hooks** (recommended) and **manual encoding** (advanced).

### ✅ Recommended: Automatic Hooks

**Hooks are the standard approach** - like other ORMs with encryption support (sequelize-encrypted, ActiveRecord encryption, Django encryption), hooks provide transparent encryption/decryption.

```typescript
addProtectHooks(User, protectClient)

// Query with plaintext - hooks handle encryption automatically
const user = await User.findOne({
  where: { email: 'alice@example.com' }
})
console.log(user.email) // Automatically decrypted
```

**Why use hooks?**
- ✅ **Standard ORM pattern** - Works like normal Sequelize
- ✅ **Transparent** - No manual encryption/decryption steps
- ✅ **Safe** - Harder to forget encryption steps or make mistakes
- ✅ **Simple** - Minimal code, maximum productivity

**Best for:** 95% of use cases - CRUD operations, APIs, GraphQL, standard applications

> **How it works:** Hooks intercept Sequelize's `beforeFind` and `afterFind` lifecycle events, encrypting WHERE clause values before the QueryGenerator runs and decrypting results after queries complete. This is a proven pattern used by many Sequelize encryption libraries.

### ⚠️ Advanced: Manual Encoding

**Manual encoding is for advanced use cases only.** Most users should use hooks.

```typescript
import { toComposite } from '@cipherstash/sequelize'

// Manually encrypt
const encrypted = await protectClient.encrypt('alice@example.com', {...})
const stringified = toComposite(encrypted.data)

// Query with encrypted value
const user = await User.findOne({
  where: { email: stringified }
})

// Manually decrypt
const decrypted = await protectClient.decrypt(user.email)
```

**When you need manual encoding:**
- Raw SQL queries (hooks don't work with `sequelize.query()`)
- Performance optimization (encrypt once, reuse across queries)
- Debugging encryption issues
- Custom encryption workflows

**Why manual encoding exists:**

Sequelize v6's architecture doesn't allow custom DataTypes to intercept WHERE clause transformation - by the time DataType methods run, WHERE clauses are already processed by the QueryGenerator. Manual encoding gives power users direct control when they need to work outside the hook system (e.g., raw SQL, custom batching).

**See [MANUAL_ENCRYPTION_GUIDE.md](./MANUAL_ENCRYPTION_GUIDE.md) for complete manual workflow.**

## Installation

```bash
npm install @cipherstash/sequelize @cipherstash/protect sequelize
```

## Prerequisites

- PostgreSQL 14+ with [EQL extension](https://cipherstash.com/docs/eql) installed
- Protect.js client configured with CipherStash
- Sequelize 6.x

> **Note:** Use `ensureEqlType()` to verify the EQL extension is installed before syncing:
> ```typescript
> import { ensureEqlType } from '@cipherstash/sequelize'
> await ensureEqlType(sequelize)  // Throws if EQL not installed
> ```
> See [Type Verification](#type-verification) for details.

## Quick Start

```typescript
import { Sequelize, DataTypes, Model } from 'sequelize'
import { ProtectClient } from '@cipherstash/protect'
import { createEncryptedType, addProtectHooks } from '@cipherstash/sequelize'

// 1. Create ENCRYPTED data type
const ENCRYPTED = createEncryptedType()

// 2. Define your model with encrypted columns
class User extends Model {
  declare id: number
  declare email: string
  declare age: number
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
      dataType: 'string',
    }),
    age: ENCRYPTED('age', {
      orderAndRange: true,         // Enable range queries
      dataType: 'number',
    }),
  },
  {
    sequelize,
    tableName: 'users',
  }
)

// 3. Initialize Protect client
const protectClient = new ProtectClient({
  // Your Protect.js configuration
})

// 4. Add encryption hooks
addProtectHooks(User, protectClient)

// 5. Query transparently!
const user = await User.findOne({
  where: { email: 'alice@example.com' }  // Automatically encrypted
})
console.log(user.email)  // Automatically decrypted: "alice@example.com"
```

## API Reference

### `createEncryptedType()`

Creates a custom Sequelize DataType for encrypted columns.

```typescript
const ENCRYPTED = createEncryptedType()
```

**Returns:** Factory function to define encrypted columns

### `ENCRYPTED(columnName, config)`

Define an encrypted column with searchable indexes.

```typescript
ENCRYPTED(columnName: string, config: EncryptedColumnConfig)
```

**Parameters:**

- `columnName` - Name of the column
- `config` - Encryption configuration:
  - `dataType?: 'string' | 'number' | 'boolean' | 'date'` - Data type for casting (default: 'string')
  - `equality?: boolean | TokenFilter[]` - Enable exact match queries
  - `orderAndRange?: boolean` - Enable range queries (>, <, BETWEEN)
  - `freeTextSearch?: boolean | MatchOpts` - Enable full-text search

**Example:**

```typescript
email: ENCRYPTED('email', {
  equality: [{ kind: 'downcase' }],  // Case-insensitive equality
  dataType: 'string',
}),

age: ENCRYPTED('age', {
  orderAndRange: true,  // Enable WHERE age > 18
  dataType: 'number',
}),

bio: ENCRYPTED('bio', {
  freeTextSearch: {
    tokenFilters: [{ kind: 'downcase' }],
    tokenizer: { kind: 'standard' },
  },
  dataType: 'string',
})
```

### `addProtectHooks(model, protectClient)`

Install encryption hooks on a Sequelize model.

```typescript
addProtectHooks<M extends Model>(
  model: ModelStatic<M>,
  protectClient: ProtectClient
): void
```

**Parameters:**

- `model` - Sequelize model class
- `protectClient` - Initialized ProtectClient instance

**Hooks installed:**

- `beforeFind` - Encrypts WHERE clause values
- `afterFind` - Decrypts query results

### `extractProtectSchema(model)`

Extract Protect.js schema from a Sequelize model.

```typescript
extractProtectSchema<M extends Model>(
  model: ModelStatic<M>
): ProtectTable<ProtectTableColumn>
```

**Parameters:**

- `model` - Sequelize model with ENCRYPTED columns

**Returns:** Protect table schema for manual operations

### Composite Type Utilities (Manual Encryption)

**⚠️ Advanced feature** - Most users should use hooks instead. These utilities are for raw SQL, performance optimization, and debugging.

These utilities allow manual encoding/decoding of encrypted values for advanced use cases.

#### `toComposite(value)`

Convert encrypted object to PostgreSQL composite type format for manual WHERE clauses.

```typescript
import { Op } from 'sequelize'
import { toComposite } from '@cipherstash/sequelize'

// Encrypt a value manually
const encrypted = await protectClient.encrypt(1000.00, {
  table: protectTransactions,
  column: protectTransactions.amount
})

// Convert to composite format for Sequelize WHERE clause
const stringified = toComposite(encrypted.data)

// Use in manual query
const results = await Transaction.findAll({
  where: {
    amount: { [Op.gte]: stringified }
  }
})
```

**Parameters:**
- `value` - Encrypted object from `protectClient.encrypt()`

**Returns:** PostgreSQL composite type string: `("{""c"":""...""}")`

#### `fromComposite(value)`

Parse PostgreSQL composite type format back to encrypted object.

```typescript
import { fromComposite } from '@cipherstash/sequelize'

// Read raw encrypted data
const [raw] = await sequelize.query(
  'SELECT email FROM users WHERE id = ?',
  { replacements: [userId] }
)

// Parse composite type
const encrypted = fromComposite(raw.email)

// Decrypt
const decrypted = await protectClient.decrypt(encrypted)
console.log(decrypted.data) // "alice@example.com"
```

#### `bulkToComposite(values)` and `bulkFromComposite(values)`

Bulk versions for arrays:

```typescript
import { bulkToComposite } from '@cipherstash/sequelize'

// Encrypt multiple values
const encrypted = await Promise.all(
  emails.map(email => protectClient.encrypt(email, {...}))
)

// Bulk convert for Op.in
const stringified = bulkToComposite(encrypted.map(e => e.data))

await User.findAll({
  where: { email: { [Op.in]: stringified } }
})
```

#### `bulkFromComposite(models)` - Ergonomic Bulk Decryption

**Recommended for bulk operations** - automatically parse all composite type fields in model objects:

```typescript
import { bulkFromComposite } from '@cipherstash/sequelize'

// Query returns models with composite type strings
const users = await User.findAll()

// Parse all composite type fields (same API as Drizzle)
const parsed = bulkFromComposite(users)

// Decrypt all models
const decrypted = await protectClient.bulkDecryptModels(parsed)

console.log(decrypted[0].email) // "alice@example.com"
console.log(decrypted[1].email) // "bob@example.com"
```

**Why use this?**
- ✅ Same ergonomic API as Drizzle's `bulkDecryptModels`
- ✅ Automatically detects and parses all encrypted fields
- ✅ No need to manually extract individual fields
- ✅ Works with nested objects and arrays
- ✅ Handles Sequelize model instances automatically

**When to use:**
- ✅ **Use hooks** for standard operations (recommended for 95% of use cases)
- ⚠️ **Use utilities** only for raw SQL, batch optimization, or debugging

**See [COMPOSITE_TYPE_UTILITIES.md](./COMPOSITE_TYPE_UTILITIES.md) for complete documentation.**

## Supported Query Operations

The integration supports automatic encryption for these Sequelize operators:

### Equality Operators (requires `equality: true`)

```typescript
// Simple equality
{ email: 'alice@example.com' }

// Op.eq
{ email: { [Op.eq]: 'alice@example.com' } }

// Op.ne
{ email: { [Op.ne]: 'bob@example.com' } }

// Op.in
{ email: { [Op.in]: ['alice@example.com', 'bob@example.com'] } }

// Op.notIn
{ email: { [Op.notIn]: ['spam@example.com'] } }
```

### Range Operators (requires `orderAndRange: true`)

```typescript
// Greater than
{ age: { [Op.gt]: 18 } }

// Less than or equal
{ age: { [Op.lte]: 65 } }

// Between
{ age: { [Op.between]: [18, 65] } }
```

### Text Search Operators (requires `freeTextSearch: true`)

```typescript
// LIKE
{ bio: { [Op.like]: '%engineer%' } }

// Case-insensitive LIKE
{ bio: { [Op.iLike]: '%engineer%' } }
```

### Logical Operators

```typescript
// Op.and
{
  [Op.and]: [
    { email: 'alice@example.com' },
    { age: { [Op.gt]: 18 } }
  ]
}

// Op.or
{
  [Op.or]: [
    { email: 'alice@example.com' },
    { email: 'bob@example.com' }
  ]
}
```

## Complete Example

```typescript
import { Sequelize, DataTypes, Model, Op } from 'sequelize'
import { ProtectClient } from '@cipherstash/protect'
import { createEncryptedType, addProtectHooks } from '@cipherstash/sequelize'

// Initialize Sequelize
const sequelize = new Sequelize({
  dialect: 'postgres',
  host: 'localhost',
  database: 'myapp',
  username: 'postgres',
  password: 'password',
})

// Create ENCRYPTED type
const ENCRYPTED = createEncryptedType()

// Define model
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
      equality: [{ kind: 'downcase' }],
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

// Initialize Protect
const protectClient = new ProtectClient({
  workspaceId: process.env.CS_WORKSPACE_ID!,
  clientId: process.env.CS_CLIENT_ID!,
  clientKey: process.env.CS_CLIENT_KEY!,
})

// Add hooks
addProtectHooks(Employee, protectClient)

// Query examples
async function examples() {
  // Find by email (case-insensitive)
  const alice = await Employee.findOne({
    where: { email: 'ALICE@EXAMPLE.COM' }
  })

  // Salary range query
  const highEarners = await Employee.findAll({
    where: {
      salary: { [Op.gte]: 100000 }
    }
  })

  // Combined query
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
}
```

## Database Schema

The package works with PostgreSQL tables using the `eql_v2_encrypted` composite type:

```sql
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email eql_v2_encrypted NOT NULL,
  age eql_v2_encrypted,
  name TEXT  -- Not encrypted
);
```

You can create migrations using Sequelize migrations and the `ENCRYPTED` type will map to `eql_v2_encrypted`.

## Troubleshooting

### "Column doesn't have equality index"

You're trying to use `Op.eq`, `Op.in`, or simple equality on a column that wasn't configured with `equality: true`.

**Fix:** Add `equality: true` to the column configuration:

```typescript
email: ENCRYPTED('email', {
  equality: true,  // Add this
  dataType: 'string',
})
```

### "Column doesn't have orderAndRange index"

You're trying to use `Op.gt`, `Op.lt`, `Op.between` on a column without `orderAndRange: true`.

**Fix:** Add `orderAndRange: true` to the column configuration:

```typescript
age: ENCRYPTED('age', {
  orderAndRange: true,  // Add this
  dataType: 'number',
})
```

### "Encryption failed" or "Decryption failed"

Check your Protect.js client configuration:

1. Verify workspace ID, client ID, and client key are correct
2. Ensure the EQL extension is installed in PostgreSQL
3. Check that your CipherStash workspace has the necessary permissions

### TypeScript errors with ENCRYPTED type

Make sure you're calling `createEncryptedType()` once per application and reusing the returned factory:

```typescript
// ✅ Correct
const ENCRYPTED = createEncryptedType()
email: ENCRYPTED('email', { equality: true })

// ❌ Wrong - creates new type each time
email: createEncryptedType()('email', { equality: true })
```

## Type Verification

Before using encrypted columns, verify that the `eql_v2_encrypted` PostgreSQL type exists:

### `ensureEqlType(sequelize)` - Fail-Fast (Recommended)

Throws an error if the EQL extension is not installed:

```typescript
import { ensureEqlType } from '@cipherstash/sequelize'

// Verify EQL extension is installed
await ensureEqlType(sequelize)

// Safe to sync
await sequelize.sync()
```

**Error if EQL not installed:**
```
Error: PostgreSQL type "eql_v2_encrypted" not found.
Install the EQL extension before using encrypted columns.
See: https://docs.cipherstash.com/reference/eql
```

### `verifyEqlType(sequelize)` - Check Existence

Returns a boolean:

```typescript
import { verifyEqlType } from '@cipherstash/sequelize'

const hasEql = await verifyEqlType(sequelize)
if (hasEql) {
  console.log('✅ EQL type available')
} else {
  console.log('❌ Install EQL extension')
}
```

### `getEqlTypeInfo(sequelize)` - Get Type Details

Returns type information:

```typescript
import { getEqlTypeInfo } from '@cipherstash/sequelize'

const info = await getEqlTypeInfo(sequelize)
console.log(info)
// {
//   schema: 'public',
//   typname: 'eql_v2_encrypted',
//   attributes: [{ attname: 'data', typname: 'jsonb' }]
// }
```

**See [TYPE_VERIFICATION.md](./TYPE_VERIFICATION.md) for complete documentation.**

## Migration from Direct Protect.js Usage

If you're currently using Protect.js directly with Sequelize models:

**Before (manual):**

```typescript
// Manual encryption
const encrypted = await protectClient.createSearchTerms([{
  value: 'alice@example.com',
  column: emailColumn,
  table: usersTable,
}])

const user = await User.findOne({
  where: { email: encrypted.data[0] }
})

// Manual decryption
const decrypted = await protectClient.bulkDecryptModels([
  user.get({ plain: true })
])
console.log(decrypted.data[0].email)
```

**After (automatic):**

```typescript
// Just query normally!
const user = await User.findOne({
  where: { email: 'alice@example.com' }
})
console.log(user.email)  // Already decrypted
```

## License

MIT

## Related Packages

- [@cipherstash/protect](https://www.npmjs.com/package/@cipherstash/protect) - Core Protect.js client
- [@cipherstash/schema](https://www.npmjs.com/package/@cipherstash/schema) - Schema definitions
- [sequelize](https://www.npmjs.com/package/sequelize) - Sequelize ORM

## Support

- [Documentation](https://cipherstash.com/docs)
- [GitHub Issues](https://github.com/cipherstash/protect-js/issues)
- [CipherStash Community](https://cipherstash.com/community)
