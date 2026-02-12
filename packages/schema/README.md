# @cipherstash/schema

A TypeScript schema builder for the Stash Stack that enables you to define encryption schemas with searchable encryption capabilities.

## Overview

`@cipherstash/schema` is a standalone package that provides the schema building functionality used by `@cipherstash/stack`. While not required for basic Stash Encryption usage, this package is available if you need to build encryption configuration schemas directly or want to understand the underlying schema structure.

## Installation

```bash
npm install @cipherstash/schema
# or
yarn add @cipherstash/schema
# or
pnpm add @cipherstash/schema
```

## Quick Start

```typescript
import { encryptedTable, encryptedColumn, buildEncryptConfig } from '@cipherstash/schema'

// Define your schema
const users = encryptedTable('users', {
  email: encryptedColumn('email').freeTextSearch().equality().orderAndRange(),
  name: encryptedColumn('name').freeTextSearch(),
  age: encryptedColumn('age').orderAndRange(),
})

// Build the encryption configuration
const config = buildEncryptConfig(users)
console.log(config)
```

## Core Functions

### `encryptedTable(tableName, columns)`

Creates a table definition with encrypted columns.

```typescript
import { encryptedTable, encryptedColumn } from '@cipherstash/schema'

const users = encryptedTable('users', {
  email: encryptedColumn('email'),
  name: encryptedColumn('name'),
})
```

### `encryptedColumn(columnName)`

Creates a column definition with configurable indexes and data types.

```typescript
import { encryptedColumn } from '@cipherstash/schema'

const emailColumn = encryptedColumn('email')
  .freeTextSearch()    // Enable text search
  .equality()          // Enable exact matching
  .orderAndRange()     // Enable sorting and range queries
  .dataType('string')  // Set data type
```

### `encryptedValue(valueName)`

Creates a value definition for nested objects (up to 3 levels deep).

```typescript
import { encryptedTable, encryptedColumn, encryptedValue } from '@cipherstash/schema'

const users = encryptedTable('users', {
  email: encryptedColumn('email').equality(),
  profile: {
    name: encryptedValue('profile.name'),
    address: {
      street: encryptedValue('profile.address.street'),
      location: {
        coordinates: encryptedValue('profile.address.location.coordinates'),
      },
    },
  },
})
```

### `buildEncryptConfig(...tables)`

Builds the final encryption configuration from table definitions.

```typescript
import { buildEncryptConfig } from '@cipherstash/schema'

const config = buildEncryptConfig(users, orders, products)
```

## Index Types

### Equality Index (`.equality()`)

Enables exact matching queries.

```typescript
const emailColumn = encryptedColumn('email').equality()
// SQL equivalent: WHERE email = 'example@example.com'
```

### Free Text Search (`.freeTextSearch()`)

Enables text search with configurable options.

```typescript
const descriptionColumn = encryptedColumn('description').freeTextSearch({
  tokenizer: { kind: 'ngram', token_length: 3 },
  token_filters: [{ kind: 'downcase' }],
  k: 6,
  m: 2048,
  include_original: true,
})
// SQL equivalent: WHERE description LIKE '%example%'
```

### Order and Range (`.orderAndRange()`)

Enables sorting and range queries.

```typescript
const priceColumn = encryptedColumn('price').orderAndRange()
// SQL equivalent: ORDER BY price ASC, WHERE price > 100
```

## Data Types

Set the data type for a column using `.dataType()`:

```typescript
const column = encryptedColumn('field')
  .dataType('string')    // text (default)
  .dataType('number')    // Javascript number (i.e. integer or float)
  .dataType('jsonb')     // JSON binary
```

## Nested Objects

Support for nested object encryption (up to 3 levels deep):

```typescript
const users = encryptedTable('users', {
  email: encryptedColumn('email').equality(),
  profile: {
    name: encryptedValue('profile.name'),
    address: {
      street: encryptedValue('profile.address.street'),
      city: encryptedValue('profile.address.city'),
      location: {
        coordinates: encryptedValue('profile.address.location.coordinates'),
      },
    },
  },
})
```

> **Note**: Nested objects are not searchable and are not recommended for SQL databases. Use separate columns for searchable fields.

## Advanced Configuration

### Custom Token Filters

```typescript
const column = encryptedColumn('field').equality([
  { kind: 'downcase' }
])
```

### Custom Match Options

```typescript
const column = encryptedColumn('field').freeTextSearch({
  tokenizer: { kind: 'standard' },
  token_filters: [{ kind: 'downcase' }],
  k: 8,
  m: 4096,
  include_original: false,
})
```

## Type Safety

The schema builder provides full TypeScript support:

```typescript
import { encryptedTable, encryptedColumn, type EncryptedTableColumn } from '@cipherstash/schema'

const users = encryptedTable('users', {
  email: encryptedColumn('email').equality(),
  name: encryptedColumn('name').freeTextSearch(),
} as const)

// TypeScript will infer the correct types
type UsersTable = typeof users
```

## Integration with Stash Encryption

While this package can be used standalone, it's typically used through `@cipherstash/stack`:

```typescript
import { encryptedTable, encryptedColumn, Encryption } from '@cipherstash/stack'

const users = encryptedTable('users', {
  email: encryptedColumn('email').equality().freeTextSearch(),
})

const client = await Encryption({
  schemas: [users],
})
```

## Generated Configuration

The `buildEncryptConfig` function generates a configuration object like this:

```typescript
{
  v: 2,
  tables: {
    users: {
      email: {
        cast_as: 'text',
        indexes: {
          unique: { token_filters: [] },
          match: {
            tokenizer: { kind: 'ngram', token_length: 3 },
            token_filters: [{ kind: 'downcase' }],
            k: 6,
            m: 2048,
            include_original: true,
          },
          ore: {},
        },
      },
    },
  },
}
```

## Use Cases

- **Standalone schema building**: When you need to generate encryption configurations outside of Stash Encryption
- **Custom tooling**: Building tools that work with CipherStash encryption schemas
- **Schema validation**: Validating schema structures before using them with Stash Encryption
- **Documentation generation**: Creating documentation from schema definitions

## API Reference

### `encryptedTable(tableName: string, columns: EncryptionTableColumn)`

Creates a table definition.

**Parameters:**
- `tableName`: The name of the table in the database
- `columns`: Object defining the columns and their configurations

**Returns:** `EncryptionTable<T> & T`

### `encryptedColumn(columnName: string)`

Creates a column definition.

**Parameters:**
- `columnName`: The name of the column in the database

**Returns:** `EncryptionColumn`

**Methods:**
- `.dataType(castAs: CastAs)`: Set the data type
- `.equality(tokenFilters?: TokenFilter[])`: Enable equality index
- `.freeTextSearch(opts?: MatchIndexOpts)`: Enable text search
- `.orderAndRange()`: Enable order and range index
- `.searchableJson()`: Enable searchable JSON index

### `encryptedValue(valueName: string)`

Creates a value definition for nested objects.

**Parameters:**
- `valueName`: Dot-separated path to the value (e.g., 'profile.name')

**Returns:** `EncryptionValue`

**Methods:**
- `.dataType(castAs: CastAs)`: Set the data type

### `buildEncryptConfig(...tables: EncryptionTable[])`

Builds the encryption configuration.

**Parameters:**
- `...tables`: Variable number of table definitions

**Returns:** `EncryptionConfigSchema`

## License

MIT License - see [LICENSE.md](../../LICENSE.md) for details.
