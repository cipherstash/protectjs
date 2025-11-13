# Sequelize Integration for Protect.js - Design Document

**Date:** 2025-11-10
**Status:** Design - Ready for Implementation
**Author:** Design Session

## Overview

This document outlines the design for integrating Protect.js with the Sequelize ORM, enabling transparent searchable encryption for Sequelize models. The integration mirrors the successful Drizzle integration while adapting to Sequelize's architecture and conventions.

## Goals

1. **Transparent encryption/decryption** - Developers use normal Sequelize syntax
2. **Type-safe** - Full TypeScript support with proper type inference
3. **Idiomatic Sequelize** - Follows Sequelize patterns and conventions
4. **Feature parity with Drizzle** - Support same encryption capabilities
5. **Performance** - Leverage bulk operations for efficiency

## Non-Goals

1. Schema migration helpers (nice-to-have, not MVP)
2. Support for non-PostgreSQL databases
3. Synchronous encryption API (Protect is async-only)

## Architecture

The integration consists of three main components:

```
┌─────────────────────────────────────────────────────────┐
│  1. Custom DataType (DataTypes.ENCRYPTED)               │
│     - Defines column type as eql_v2_encrypted           │
│     - Stores encryption config (equality, range, etc.)  │
│     - Handles composite type parsing                     │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│  2. addProtectHooks(Model, protectClient)               │
│     - Registers beforeFind + afterFind hooks            │
│     - Hooks detect encrypted columns automatically      │
│     - Transforms WHERE clauses and decrypts results     │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│  3. Schema Extraction (extractProtectSchema)            │
│     - Extracts Protect schema from Sequelize models     │
│     - Used to initialize ProtectClient                  │
│     - Maps configs to Protect index definitions         │
└─────────────────────────────────────────────────────────┘
```

### Key Design Decision: Hook-Based Transparent Encryption

Unlike Drizzle's explicit operator approach (`protectOps.eq()`), Sequelize's async hook support enables a more transparent integration:

- **beforeFind hook**: Intercepts queries before execution, encrypts WHERE clause values
- **afterFind hook**: Intercepts results after query, decrypts returned models
- **Native operators**: EQL's PostgreSQL operator classes handle `=`, `>`, `LIKE`, etc. on encrypted data

This approach provides the "most Sequelize way" - developers use normal `Op.eq`, `Op.gt`, etc. without special syntax.

## Component Details

### 1. Custom DataType: `DataTypes.ENCRYPTED`

**File:** `packages/sequelize/src/data-type.ts`

Creates a custom Sequelize data type that maps to PostgreSQL's `eql_v2_encrypted` composite type.

**Key responsibilities:**
- Define SQL type as `eql_v2_encrypted`
- Parse composite type format from database: `("ciphertext")`
- Serialize values to composite type format for database
- Store encryption configuration for hook access

**Configuration options:**
```typescript
{
  dataType?: 'string' | 'number' | 'json',  // Decrypted data type
  equality?: boolean | TokenFilter[],        // Enable equality search
  freeTextSearch?: boolean | MatchIndexOpts, // Enable LIKE/ILIKE search
  orderAndRange?: boolean                    // Enable >, <, ORDER BY
}
```

**Registry pattern:**
- Stores column configurations in a Map keyed by column name
- Hooks retrieve configs via `getEncryptedColumnConfig(columnName)`
- Enables multiple models to share config lookup

### 2. Hook Implementation

**File:** `packages/sequelize/src/hooks.ts`

Installs `beforeFind` and `afterFind` hooks on Sequelize models to handle encryption/decryption transparently.

#### beforeFind Hook

Transforms the WHERE clause to encrypt search values:

```typescript
User.addHook('beforeFind', async (options: FindOptions) => {
  if (!options.where) return

  // Recursively transform WHERE clause
  options.where = await transformWhereClause(
    options.where,
    model,
    protectClient,
    protectTable
  )
})
```

**WHERE clause transformation logic:**
1. Traverse WHERE object recursively (handles `Op.and`, `Op.or` nesting)
2. For each column, check if it's encrypted via config registry
3. If encrypted, transform operator values:
   - `Op.eq`, `Op.ne`: Encrypt value, PostgreSQL `=` and `!=` work natively
   - `Op.gt`, `Op.gte`, `Op.lt`, `Op.lte`: Encrypt value, PostgreSQL comparison operators work via EQL operator classes
   - `Op.like`, `Op.iLike`: Encrypt value, PostgreSQL LIKE/ILIKE work natively
   - `Op.between`: Encrypt both min and max values
   - `Op.in`, `Op.notIn`: Bulk encrypt array of values
4. Use `protectClient.createSearchTerms()` for encryption (batches multiple values)

**Why this works:** EQL implements PostgreSQL operator classes for `eql_v2_encrypted` type, so native operators (`=`, `>`, `<`, `LIKE`) work directly on encrypted columns. No custom SQL generation needed!

#### afterFind Hook

Decrypts query results:

```typescript
User.addHook('afterFind', async (result: M | M[] | null) => {
  if (!result) return result

  const models = Array.isArray(result) ? result : [result]

  // Bulk decrypt all models
  const decrypted = await protectClient.bulkDecryptModels(
    models.map(m => m.get({ plain: true }))
  )

  // Update model instances with decrypted values
  for (let i = 0; i < models.length; i++) {
    models[i].set(decrypted.data[i], { raw: true })
  }

  return result
})
```

**Key decisions:**
- Uses `bulkDecryptModels` for efficiency (batch operation)
- Updates model instances in-place
- Preserves single vs array result type

### 3. Schema Extraction

**File:** `packages/sequelize/src/schema-extraction.ts`

Extracts a Protect.js schema from Sequelize model definitions.

```typescript
export function extractProtectSchema<M extends Model>(
  model: ModelStatic<M>
): ProtectTable<ProtectTableColumn>
```

**Process:**
1. Get model attributes via `model.getAttributes()`
2. For each encrypted column (has config in registry):
   - Map `dataType` to Protect's `cast` parameter
   - Build indexes array based on config:
     - `equality: true` → `{ kind: 'match', tokenFilters: [...] }`
     - `freeTextSearch: true` → `{ kind: 'match', ... }` with ngram tokenizer
     - `orderAndRange: true` → `{ kind: 'ore' }`
   - Create column via `csColumn({ cast, indexes })`
3. Return table schema via `csTable(columns)`

**Design note:** Matches Drizzle's schema extraction pattern, reusing `csTable` and `csColumn` from `@cipherstash/schema`.

## Usage Example

### Setup (One-Time)

```typescript
// 1. Define model with encrypted columns
import { Model, DataTypes } from 'sequelize'
import { createEncryptedType } from '@cipherstash/sequelize'

const ENCRYPTED = createEncryptedType()

class User extends Model {
  declare id: number
  declare email: string
  declare age: number
}

User.init({
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  email: {
    type: ENCRYPTED('email', {
      equality: true,
      freeTextSearch: true,
      orderAndRange: true
    })
  },
  age: {
    type: ENCRYPTED('age', {
      dataType: 'number',
      equality: true,
      orderAndRange: true
    })
  }
}, { sequelize, tableName: 'users' })

// 2. Initialize Protect and install hooks
import { protect } from '@cipherstash/protect'
import { extractProtectSchema, addProtectHooks } from '@cipherstash/sequelize'

const userSchema = extractProtectSchema(User)
const protectClient = await protect({ schemas: [userSchema] })
addProtectHooks(User, protectClient)
```

### Queries (Normal Sequelize Syntax)

```typescript
// Equality
const user = await User.findOne({
  where: { email: 'john@example.com' }
})

// Range queries
const adults = await User.findAll({
  where: { age: { [Op.gte]: 18 } }
})

// Text search
const gmailUsers = await User.findAll({
  where: { email: { [Op.iLike]: '%@gmail.com' } }
})

// Complex conditions
const results = await User.findAll({
  where: {
    [Op.and]: [
      { age: { [Op.between]: [25, 35] } },
      { email: { [Op.iLike]: '%developer%' } }
    ]
  },
  order: [['age', 'DESC']],  // ORDER BY works natively!
  limit: 10
})

// All results automatically decrypted!
```

## Supported Query Features

### Operators (via EQL operator classes)

| Sequelize Operator | Supported | Requires Config |
|-------------------|-----------|-----------------|
| `Op.eq` | ✅ | `equality: true` |
| `Op.ne` | ✅ | `equality: true` |
| `Op.gt` | ✅ | `orderAndRange: true` |
| `Op.gte` | ✅ | `orderAndRange: true` |
| `Op.lt` | ✅ | `orderAndRange: true` |
| `Op.lte` | ✅ | `orderAndRange: true` |
| `Op.between` | ✅ | `orderAndRange: true` |
| `Op.notBetween` | ✅ | `orderAndRange: true` |
| `Op.like` | ✅ | `freeTextSearch: true` |
| `Op.iLike` | ✅ | `freeTextSearch: true` |
| `Op.notLike` | ✅ | `freeTextSearch: true` |
| `Op.notILike` | ✅ | `freeTextSearch: true` |
| `Op.in` | ✅ | `equality: true` |
| `Op.notIn` | ✅ | `equality: true` |
| `Op.and` | ✅ | N/A |
| `Op.or` | ✅ | N/A |

### Query Methods

| Method | Supported | Notes |
|--------|-----------|-------|
| `findAll()` | ✅ | Results auto-decrypted |
| `findOne()` | ✅ | Result auto-decrypted |
| `findByPk()` | ✅ | If PK is encrypted |
| `count()` | ✅ | WHERE clause encrypted |
| `findAndCountAll()` | ✅ | Results auto-decrypted |
| `create()` | ⚠️ | Manual encryption needed* |
| `bulkCreate()` | ⚠️ | Manual encryption needed* |
| `update()` | ⚠️ | WHERE encrypted, SET values manual* |

*Note: Create/update operations need `beforeCreate`/`beforeUpdate` hooks for automatic encryption. This is a future enhancement.

### Other Features

- **ORDER BY**: Works natively via EQL operator classes
- **DISTINCT**: Supported on encrypted columns with equality index
- **GROUP BY**: Supported on encrypted columns with equality index
- **Associations**: Should work if hooks run on included models (needs testing)

## Edge Cases and Limitations

### Known Limitations

1. **Create/Update operations**: MVP focuses on read queries (find operations). Write operations require manual encryption:
   ```typescript
   const encrypted = await protectClient.encryptModel(
     { email: 'test@example.com', age: 25 },
     userSchema
   )
   await User.create(encrypted.data)
   ```

2. **Associations with includes**: `afterFind` hook behavior with `include` needs testing. Sequelize may not run hooks on included models.

3. **Raw queries**: No support for raw SQL queries with encrypted columns (use model methods).

4. **Transactions**: Hook behavior within transactions needs verification.

### Error Handling

**Validation errors:**
- Column doesn't have required index for operator
- Throw clear error: `Column ${columnName} doesn't have equality index`

**Encryption/decryption failures:**
- Propagate ProtectClient errors with context
- Include column name and operation in error message

**Configuration errors:**
- Model has no encrypted columns: Throw from `extractProtectSchema`
- Missing ProtectClient: Throw from `addProtectHooks`

## Performance Considerations

### Optimizations

1. **Bulk encryption**: Use `createSearchTerms()` to batch multiple values in one operation
   - `Op.in` with array: Single batch encrypt call
   - `Op.and` with multiple encrypted columns: Could batch (future optimization)

2. **Bulk decryption**: Use `bulkDecryptModels()` for all results in one call

3. **Config caching**: Column configs stored in Map, retrieved once per query

### Performance Notes

- **Hook overhead**: Sequelize runs hooks in series, adds latency to queries
- **Encryption latency**: Each query with encrypted WHERE incurs encryption overhead
- **Network round-trips**: Protect API calls (encryption/decryption) add round-trips

## Testing Strategy

### Unit Tests

1. **DataType tests**:
   - Composite type parsing
   - Composite type serialization
   - Config storage and retrieval

2. **Hook tests**:
   - WHERE clause transformation for each operator
   - Nested conditions (Op.and, Op.or)
   - Decryption of single vs array results
   - Error handling for invalid configs

3. **Schema extraction tests**:
   - Extract from model with encrypted columns
   - Index mapping for each config option
   - Error on model with no encrypted columns

### Integration Tests

1. **End-to-end queries**:
   - Define model, install hooks, run queries
   - Verify encryption in database
   - Verify decryption in results

2. **Operator coverage**:
   - Test each supported operator
   - Test operator combinations

3. **Edge cases**:
   - Empty results
   - Null values
   - Mixed encrypted/non-encrypted columns

## Migration and Setup

### Database Setup

Users must install EQL schema in PostgreSQL:

```bash
# Option 1: Use Drizzle migration helper (if available)
npx generate-eql-migration

# Option 2: Manual installation
curl -sL https://github.com/cipherstash/encrypt-query-language/releases/latest/download/cipherstash-encrypt.sql | psql $DATABASE_URL
```

### Application Setup

```typescript
// 1. Create models with ENCRYPTED type
// 2. Extract schemas
// 3. Initialize ProtectClient
// 4. Install hooks (one time, during app initialization)
```

**Important**: `addProtectHooks()` must be called ONCE during app initialization, not per-request.

## Package Structure

```
packages/sequelize/
├── src/
│   ├── index.ts              # Main exports
│   ├── data-type.ts          # ENCRYPTED DataType
│   ├── hooks.ts              # beforeFind/afterFind hooks
│   ├── schema-extraction.ts  # extractProtectSchema
│   └── types.ts              # TypeScript type definitions
├── __tests__/
│   ├── data-type.test.ts
│   ├── hooks.test.ts
│   ├── schema-extraction.test.ts
│   └── integration.test.ts
├── package.json
├── tsconfig.json
└── README.md
```

## API Surface

### Exports

```typescript
// Main API
export { createEncryptedType } from './data-type'
export { addProtectHooks } from './hooks'
export { extractProtectSchema, extractProtectSchemas } from './schema-extraction'

// Types
export type { EncryptedColumnConfig } from './types'
```

### Type Definitions

```typescript
export interface EncryptedColumnConfig {
  dataType?: 'string' | 'number' | 'json'
  equality?: boolean | TokenFilter[]
  freeTextSearch?: boolean | MatchIndexOpts
  orderAndRange?: boolean
}
```

## Future Enhancements

1. **Write operation hooks**: Add `beforeCreate`/`beforeUpdate` hooks for automatic encryption on create/update
2. **Association support**: Test and fix `afterFind` with `include`
3. **Schema migration helpers**: CLI tool for generating Sequelize migrations with EQL setup
4. **Batch optimization**: Detect multiple encrypted columns in `Op.and` and batch encrypt in one call
5. **Custom operators**: Support for custom Sequelize operators

## Success Criteria

- ✅ Developers can define encrypted columns with simple config
- ✅ Normal Sequelize queries work without special syntax
- ✅ All comparison operators supported
- ✅ Text search (LIKE/ILIKE) supported
- ✅ Ordering on encrypted columns works
- ✅ Results automatically decrypted
- ✅ Type-safe TypeScript definitions
- ✅ Performance comparable to Drizzle integration

## Open Questions

1. **Hook execution order**: If user has other beforeFind/afterFind hooks, what's the execution order?
2. **Association includes**: Do hooks run on included models? Need testing.
3. **Scopes**: Do Sequelize scopes work with encrypted columns?
4. **Virtual fields**: How do virtuals interact with encrypted columns?

## References

- [Drizzle Integration](https://github.com/cipherstash/protect-eql/blob/main/markdown/drizzle.md)
- [Sequelize Hooks Documentation](https://sequelize.org/docs/v7/other-topics/hooks/)
- [Sequelize Custom Data Types](https://sequelize.org/docs/v7/other-topics/other-data-types/)
- [EQL Operator Classes](https://github.com/cipherstash/encrypt-query-language)
