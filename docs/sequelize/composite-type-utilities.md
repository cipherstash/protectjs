# Composite Type Utilities

> ## ⚠️ Advanced Feature - Use Hooks Instead
>
> **These utilities are for advanced use cases only.** Most users (95%+) should use the automatic hooks approach instead.
>
> **👉 See [README.md](./README.md) for the recommended hooks-based approach.**

## Overview

When working with encrypted columns in Sequelize, you have two approaches:

1. **✅ Automatic (Recommended)** - Use hooks for transparent encryption/decryption
2. **⚠️ Manual (Advanced)** - Manually encrypt values and encode them for queries

The composite type utilities enable the manual approach by providing functions to encode/decode encrypted values to PostgreSQL's `eql_v2_encrypted` composite type format.

## Why Manual Encoding Exists

### Sequelize v6 Architectural Limitation

Sequelize v6's architecture has a fundamental constraint: **custom DataTypes cannot intercept WHERE clause transformation.**

Here's why:

1. **DataType methods run too late** - By the time your custom DataType's `toSQL()` or `_stringify()` methods run, the QueryGenerator has already converted WHERE clauses into SQL strings
2. **WHERE clause processing happens first** - The QueryGenerator processes `where: { email: 'value' }` into SQL before consulting DataType methods
3. **No hook point for DataTypes** - There's no lifecycle method in the DataType API that runs during WHERE clause transformation

This means we **cannot** make encryption invisible at the DataType level alone.

### The Solution: Hooks

**Hooks intercept at the right point** in Sequelize's lifecycle:

- `beforeFind` runs **before** the QueryGenerator processes WHERE clauses
- This lets us transform `{ email: 'alice@example.com' }` into `{ email: encrypted_value }` before SQL generation
- `afterFind` decrypts results after queries complete

This is why **hooks are the recommended approach** - they work within Sequelize's architecture to provide transparent encryption.

### The Trade-Off: When Hooks Don't Work

Hooks only fire for Sequelize model methods (`findOne`, `findAll`, etc.). They **don't work** with:

- Raw SQL queries (`sequelize.query()`)
- Custom query builders
- Direct database access

**Manual encoding gives you control** when you need to work outside the hook system.

### This Is a Proven Pattern

Other Sequelize encryption libraries use the same approach:
- sequelize-encrypted: Uses hooks
- ActiveRecord (Rails): Uses callbacks
- Django ORM: Uses field pre_save/post_init

**It's the standard ORM encryption pattern.**

## Why These Utilities?

The `eql_v2_encrypted` type uses PostgreSQL composite type format: `("json_string")`

When you manually encrypt a value with `protectClient.encrypt()`, you get a JavaScript object:

```typescript
const encrypted = await protectClient.encrypt('alice@example.com', {
  table: protectUsers,
  column: protectUsers.email
})

console.log(encrypted.data)
// {
//   c: "encrypted_ciphertext",
//   k: "key_data",
//   i: "iv_data",
//   t: ["token1", "token2"]
// }
```

But Sequelize needs this in **composite type format** for WHERE clauses:

```typescript
// PostgreSQL expects: ("{""c"":""encrypted_ciphertext"",...}")
```

## The Utilities

### `toComposite(value)` - Encode for Queries

Converts an encrypted object to PostgreSQL composite type format.

```typescript
import { toComposite } from '@cipherstash/sequelize'

// Encrypt a value
const encrypted = await protectClient.encrypt(1000.00, {
  table: protectTransactions,
  column: protectTransactions.amount
})

// Stringify for Sequelize WHERE clause
const stringified = toComposite(encrypted.data)
// Returns: ("{""c"":""..."",""k"":""..."",""t"":[...]}")

// Query with Op.gte
const results = await Transaction.findAll({
  where: {
    amount: { [Op.gte]: stringified }
  }
})
```

### `fromComposite(value)` - Decode from Queries

Parses PostgreSQL composite type format back to encrypted object.

```typescript
import { fromComposite } from '@cipherstash/sequelize'

// Read raw encrypted data from database
const [raw] = await sequelize.query(
  'SELECT email FROM users WHERE id = ?',
  { replacements: [userId] }
)

// Parse composite type
const encrypted = fromComposite(raw.email)
// Returns: { c: "ciphertext...", k: "...", ... }

// Decrypt
const decrypted = await protectClient.decrypt(encrypted)
console.log(decrypted.data) // "alice@example.com"
```

### `bulkToComposite(values)` - Encode Arrays

Stringify multiple encrypted values (useful for `Op.in` queries).

```typescript
import { Op } from 'sequelize'
import { bulkToComposite } from '@cipherstash/sequelize'

// Encrypt multiple values
const emails = ['alice@example.com', 'bob@example.com']
const encrypted = await Promise.all(
  emails.map(email =>
    protectClient.encrypt(email, {
      table: protectUsers,
      column: protectUsers.email
    })
  )
)

// Bulk stringify for Op.in
const stringified = bulkToComposite(encrypted.map(e => e.data))

// Query
const users = await User.findAll({
  where: {
    email: { [Op.in]: stringified }
  }
})
```

### `bulkFromComposite(values)` - Decode Arrays

Parse multiple composite type values.

```typescript
import { bulkFromComposite } from '@cipherstash/sequelize'

// Read raw encrypted data
const [rows] = await sequelize.query(
  'SELECT email FROM users WHERE id IN (?)',
  { replacements: [userIds] }
)

// Bulk parse
const encrypted = bulkFromComposite(rows.map(r => r.email))

// Bulk decrypt
const decrypted = await protectClient.bulkDecrypt(encrypted)
```

## Usage Patterns

### Pattern 1: Range Queries (Manual)

```typescript
import { Op } from 'sequelize'
import { toComposite } from '@cipherstash/sequelize'

// Encrypt search value
const minAmount = await protectClient.encrypt(1000.00, {
  table: protectTransactions,
  column: protectTransactions.amount
})

const maxAmount = await protectClient.encrypt(5000.00, {
  table: protectTransactions,
  column: protectTransactions.amount
})

// Stringify for WHERE clause
const minStringified = toComposite(minAmount.data)
const maxStringified = toComposite(maxAmount.data)

// Query
const transactions = await Transaction.findAll({
  where: {
    amount: {
      [Op.between]: [minStringified, maxStringified]
    }
  }
})

// Decrypt results
const decrypted = await protectClient.bulkDecryptModels(
  transactions.map(t => t.get({ plain: true }))
)

console.log(decrypted.data)
```

### Pattern 2: Multiple Values (Manual)

```typescript
import { Op } from 'sequelize'
import { bulkToComposite } from '@cipherstash/sequelize'

// Encrypt multiple search values
const emails = ['alice@example.com', 'bob@example.com', 'charlie@example.com']

const encrypted = await Promise.all(
  emails.map(email =>
    protectClient.encrypt(email, {
      table: protectUsers,
      column: protectUsers.email
    })
  )
)

// Bulk stringify
const stringified = bulkToComposite(encrypted.map(e => e.data))

// Query with Op.in
const users = await User.findAll({
  where: {
    email: { [Op.in]: stringified }
  }
})

// Decrypt results
const decrypted = await protectClient.bulkDecryptModels(
  users.map(u => u.get({ plain: true }))
)

console.log(decrypted.data)
```

### Pattern 3: Reading Raw Data

```typescript
import { fromComposite } from '@cipherstash/sequelize'

// Execute raw SQL
const [rows] = await sequelize.query(
  'SELECT id, email, age FROM users LIMIT 10'
)

// Parse encrypted fields
const parsed = rows.map(row => ({
  id: row.id,
  email: fromComposite(row.email),
  age: fromComposite(row.age),
}))

// Bulk decrypt
const decrypted = await protectClient.bulkDecrypt(
  parsed.map(p => p.email)
)

console.log(decrypted.data)
```

## When to Use Manual vs Hooks

### Use Hooks (Recommended)

**Pros:**
- ✅ Fully transparent - query with plaintext
- ✅ Automatic encryption/decryption
- ✅ Less code to write
- ✅ Harder to make mistakes

```typescript
// With hooks - simple!
const user = await User.findOne({
  where: { email: 'alice@example.com' }
})
console.log(user.email) // Automatically decrypted
```

**Use when:**
- Standard CRUD operations
- Building APIs
- Working with ORM patterns
- Want simplicity and safety

### Use Manual Encoding (Advanced)

**Pros:**
- ✅ Fine-grained control
- ✅ Can optimize encryption calls
- ✅ Useful for raw SQL queries
- ✅ Needed when hooks don't fire

```typescript
// Manual - more control
const encrypted = await protectClient.encrypt('alice@example.com', {...})
const stringified = toComposite(encrypted.data)

const user = await User.findOne({
  where: { email: stringified }
})

const decrypted = await protectClient.decrypt(user.email)
console.log(decrypted.data)
```

**Use when:**
- Custom query optimization needed
- Executing raw SQL
- Batch operations outside hooks
- Debugging encryption issues
- Learning how encryption works

## PostgreSQL Composite Type Format

The `eql_v2_encrypted` type uses this format:

### Structure

```
("json_with_doubled_quotes")
```

**Key points:**
- Outer parentheses: `( )`
- Outer quotes: `" "`
- Escaped quotes: `""` (doubled, not backslash)

### Examples

**JavaScript Object:**
```javascript
{ c: "ciphertext", k: "key" }
```

**Composite Type String:**
```
("{""c"":""ciphertext"",""k"":""key""}")
```

### Escaping Rules

PostgreSQL composite types use **doubled quotes** for escaping:

```javascript
// JavaScript
{ message: 'Hello "World"' }

// Composite type
("{""message"":""Hello ""World""""}")
//                      ^^     ^^
//                      Escaped quotes
```

**NOT backslash escaping:**
```javascript
// ❌ Wrong - backslash escaping
("{\"message\":\"Hello \\\"World\\\"\"}")

// ✅ Right - doubled quotes
("{""message"":""Hello ""World""""}")
```

## Integration with protect-eql

The utilities match the `toComposite` function from protect-eql:

```typescript
// From protect-eql/src/executors/sequelize-protect.ts
function toComposite(value: any): string {
  const jsonStr = JSON.stringify(value)
  const escaped = jsonStr.replace(/"/g, '""')
  return `("${escaped}")`
}
```

Now available as a package export:

```typescript
import { toComposite } from '@cipherstash/sequelize'
```

## Testing

The utilities include comprehensive tests:

```bash
$ pnpm test composite-type

✓ __tests__/composite-type.test.ts (20 tests) 6ms
  ✓ toComposite
  ✓ fromComposite
  ✓ bulkToComposite
  ✓ bulkFromComposite
  ✓ Round-trip conversion
  ✓ Integration examples

Test Files  1 passed (1)
     Tests  20 passed (20)
```

### Test Coverage

- ✅ Encoding to composite format
- ✅ Decoding from composite format
- ✅ Quote escaping (doubled quotes)
- ✅ Nested objects
- ✅ Arrays
- ✅ Unicode characters
- ✅ Round-trip preservation
- ✅ Bulk operations
- ✅ Integration patterns

## API Reference

### `toComposite(value: any): string`

**Parameters:**
- `value` - Encrypted object from `protectClient.encrypt()`

**Returns:**
- PostgreSQL composite type string

**Example:**
```typescript
const encrypted = await protectClient.encrypt('test', {...})
const stringified = toComposite(encrypted.data)
// "("{""c"":""...""}")"
```

### `fromComposite(value: string): any`

**Parameters:**
- `value` - PostgreSQL composite type string

**Returns:**
- Encrypted object

**Example:**
```typescript
const parsed = fromComposite('("{""c"":""test""}")')
// { c: "test" }
```

### `bulkToComposite(values: any[]): string[]`

**Parameters:**
- `values` - Array of encrypted objects

**Returns:**
- Array of composite type strings

**Example:**
```typescript
const encrypted = [{ c: "a" }, { c: "b" }]
const stringified = bulkToComposite(encrypted)
// ['("{""c"":""a""}")','("{""c"":""b""}") ']
```

### `bulkFromComposite(values: string[]): any[]`

**Parameters:**
- `values` - Array of composite type strings

**Returns:**
- Array of encrypted objects

**Example:**
```typescript
const strings = ['("{""c"":""a""}")','("{""c"":""b""}") ']
const parsed = bulkFromComposite(strings)
// [{ c: "a" }, { c: "b" }]
```

## Common Issues

### Issue: Quotes Not Escaped Correctly

**Problem:**
```typescript
// ❌ Using backslash escaping
const wrong = '("{\\"key\\":\\"value\\"}")'
```

**Solution:**
```typescript
// ✅ Use doubled quotes
const right = '("{""key"":""value""}")'

// Or use toComposite
const stringified = toComposite({ key: "value" })
```

### Issue: Encrypted Value Not Recognized

**Problem:**
```typescript
const encrypted = await protectClient.encrypt('test', {...})

// ❌ Passing object directly
await User.findAll({
  where: { email: encrypted.data }  // Won't work!
})
```

**Solution:**
```typescript
// ✅ Stringify first
const stringified = toComposite(encrypted.data)
await User.findAll({
  where: { email: stringified }
})
```

### Issue: Raw Query Returns Composite String

**Problem:**
```typescript
const [row] = await sequelize.query('SELECT email FROM users LIMIT 1')
console.log(row.email)
// ("{""c"":""...""}")  // String, not object!
```

**Solution:**
```typescript
// ✅ Parse composite type
const encrypted = fromComposite(row.email)
// { c: "..." }  // Now an object

const decrypted = await protectClient.decrypt(encrypted)
console.log(decrypted.data)  // "alice@example.com"
```

## Summary

**The composite type utilities enable manual encryption workflows:**

| Function | Purpose | Use Case |
|----------|---------|----------|
| `toComposite` | Encode for queries | Manual WHERE clauses |
| `fromComposite` | Decode from queries | Raw SQL results |
| `bulkToComposite` | Encode arrays | Op.in queries |
| `bulkFromComposite` | Decode arrays | Bulk raw results |

**Recommended approach:**
1. **Use hooks** for standard operations (easier, safer)
2. **Use utilities** for advanced cases (raw SQL, optimization, debugging)

**Format to remember:**
```
("{""key"":""value""}")
```
- Parentheses + quotes wrapping
- Doubled quotes `""` for escaping
- JSON inside

## See Also

- **Implementation:** `src/composite-type.ts`
- **Tests:** `__tests__/composite-type.test.ts`
- **Hooks Documentation:** `README.md`
- **protect-eql Example:** `/Users/tobyhede/src/protect-eql`
