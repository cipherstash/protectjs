# Using CipherStash Stash Encryption with Supabase SDK

You can encrypt data [in-use](../concepts/searchable-encryption.md) with Stash Encryption and store it in your Supabase project all while maintaining the ability to search the data without decryption.
This reference guide will show you how to do this with the Supabase SDK.

> [!NOTE]
> The following assumes you have installed the [latest version of the EQL v2 extension](https://github.com/cipherstash/encrypt-query-language/releases) which has a specific release for Supabase, and gone through the [Stash Encryption setup guide](https://github.com/cipherstash/protectjs).

## Defining your column types

You need to define your column types as `eql_v2_encrypted` in your Supabase project, which is available after you [install the EQL v2 extension](https://github.com/cipherstash/encrypt-query-language/releases).

```sql
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  name eql_v2_encrypted,
  email eql_v2_encrypted
);
```

Under the hood, the EQL payload is a JSON object that is stored as a composite type in the database.

## Inserting data

You can insert encrypted data into the table using Stash Encryption and the Supabase SDK. Since the `eql_v2_encrypted` column is a composite type, you'll need to use the `encryptedToPgComposite` helper to properly format the data:

```typescript
import {
  Encryption,
  encryptedTable,
  encryptedColumn,
  encryptedToPgComposite,
  type EncryptionClientConfig
} from '@cipherstash/stack'

const users = encryptedTable('users', {
  name: encryptedColumn('name').freeTextSearch().equality(),
  email: encryptedColumn('email').freeTextSearch().equality()
})

const config: EncryptionClientConfig = {
  schemas: [users],
}

const protectClient = await Encryption(config)

const encryptedResult = await protectClient.encryptModel(
  {
    name: 'John Doe',
    email: 'john.doe@example.com'
  },
  users
)

if (encryptedResult.failure) {
  // Handle the failure
}

const { data, error } = await supabase
  .from('users')
  .insert([encryptedToPgComposite(encryptedResult.data)])
```

## Selecting data

When selecting encrypted data from the table using the Supabase SDK, it's important to cast the encrypted columns to `jsonb` to get the raw encrypted payload. This is necessary because the `eql_v2_encrypted` type is stored as a composite type in PostgreSQL:

```typescript
const { data, error } = await supabase
  .from('users')
  .select('id, email::jsonb, name::jsonb')
```

Without the `::jsonb` cast, the encrypted payload would be wrapped in an object with a `data` key, which would require additional handling before decryption. The cast ensures you get the raw encrypted payload that can be directly used with Stash Encryption for decryption:

```typescript
const decryptedResult = await protectClient.decryptModel(data[0])

if (decryptedResult.failure) {
  // Handle the failure
}

console.log('Decrypted user:', decryptedResult.data)
```

## Working with models

When working with models that contain multiple encrypted fields, you can use the `modelToEncryptedPgComposites` helper to handle the conversion to PostgreSQL composite types:

```typescript
import {
  Encryption,
  encryptedTable,
  encryptedColumn,
  modelToEncryptedPgComposites,
  type EncryptionClientConfig
} from '@cipherstash/stack'

const users = encryptedTable('users', {
  name: encryptedColumn('name').freeTextSearch().equality(),
  email: encryptedColumn('email').freeTextSearch().equality()
})

const config: EncryptionClientConfig = {
  schemas: [users],
}

const protectClient = await Encryption(config)

const model = {
  name: 'John Doe',
  email: 'john.doe@example.com',
  otherField: 'not encrypted'
}

const encryptedModel = await protectClient.encryptModel(model, users)

const { data, error } = await supabase
  .from('users')
  .insert([modelToEncryptedPgComposites(encryptedModel.data)])
```

For bulk operations with multiple models, you can use `bulkEncryptModels` and `bulkModelsToEncryptedPgComposites`:

```typescript
const models = [
  {
    name: 'John Doe',
    email: 'john.doe@example.com',
    otherField: 'not encrypted 1'
  },
  {
    name: 'Jane Smith',
    email: 'jane.smith@example.com',
    otherField: 'not encrypted 2'
  }
]

const encryptedModels = await protectClient.bulkEncryptModels(models, users)

const { data, error } = await supabase
  .from('users')
  .insert(bulkModelsToEncryptedPgComposites(encryptedModels.data))
  .select('id')

// When selecting multiple records, remember to use ::jsonb
const { data: selectedData, error: selectError } = await supabase
  .from('users')
  .select('id, name::jsonb, email::jsonb, otherField')

// Decrypt all models at once
const decryptedModels = await protectClient.bulkDecryptModels(selectedData)
```

## Exposing EQL schema

These instructions are referenced from the [Supabase docs](https://supabase.com/docs/guides/api/using-custom-schemas) and are used to expose the EQL schema to the Supabase SDK.

1. Go to [API settings](https://supabase.com/dashboard/project/_/settings/api) and add `eql_v2` to "Exposed schemas".
2. Then run the following in the Supabase project as raw SQL:

```sql
GRANT USAGE ON SCHEMA eql_v2 TO anon, authenticated, service_role;Add commentMore actions
GRANT ALL ON ALL TABLES IN SCHEMA eql_v2 TO anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA eql_v2 TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA eql_v2 TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA eql_v2 GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA eql_v2 GRANT ALL ON ROUTINES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA eql_v2 GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
```

## Converting Encrypted Search Terms

When searching encrypted data, you need to convert the encrypted payload into a format that PostgreSQL and the Supabase SDK can understand. The encrypted payload needs to be converted to a raw composite type format by double stringifying the JSON:

```typescript
const searchTerms = await protectClient.createSearchTerms([
  {
    value: 'billy@example.com',
    column: users.email,
    table: users,
    returnType: 'composite-literal'
  }
])

const searchTerm = searchTerms.data[0]
```

For certain queries, when including the encrypted search term with an operator that uses the string logic syntax, you need to use the 'escaped-composite-literal' return type:

```typescript
const searchTerms = await protectClient.createSearchTerms([
  {
    value: 'billy@example.com',
    column: users.email,
    table: users,
    returnType: 'escaped-composite-literal'
  }
])

const searchTerm = searchTerms.data[0]
```

## Query Examples

Here are examples of different ways to search encrypted data using the Supabase SDK:

### Equality Search

```typescript
const searchTerms = await protectClient.createSearchTerms([
  {
    value: 'billy@example.com',
    column: users.email,
    table: users,
    returnType: 'composite-literal'
  }
])

const { data, error } = await supabase
  .from('users')
  .select('id, email::jsonb, name::jsonb')
  .eq('email', searchTerms.data[0])
```

### Pattern Matching Search

```typescript
const searchTerms = await protectClient.createSearchTerms([
  {
    value: 'example.com',
    column: users.email,
    table: users,
    returnType: 'composite-literal'
  }
])

const { data, error } = await supabase
  .from('users')
  .select('id, email::jsonb, name::jsonb')
  .like('email', searchTerms.data[0])
```

### IN Operator Search

When you need to search for multiple encrypted values, you can use the IN operator. Each encrypted value needs to be properly formatted and combined:

```typescript
// Encrypt multiple search terms
const searchTerms = await protectClient.createSearchTerms([
  {
    value: 'value1',
    column: users.name,
    table: users,
    returnType: 'escaped-composite-literal'
  },
  {
    value: 'value2',
    column: users.name,
    table: users,
    returnType: 'escaped-composite-literal'
  }
])

// Combine terms for IN operator
const { data, error } = await supabase
  .from('users')
  .select('id, email::jsonb, name::jsonb')
  .filter('name', 'in', `(${searchTerms.data[0]},${searchTerms.data[1]})`)
```

### OR Condition Search

You can combine multiple encrypted search conditions using the `.or()` syntax. This is useful when you want to search across multiple encrypted columns:

```typescript
// Encrypt search terms for different columns
const searchTerms = await protectClient.createSearchTerms([
  {
    value: 'user@example.com',
    column: users.email,
    table: users,
    returnType: 'escaped-composite-literal'
  },
  {
    value: 'John',
    column: users.name,
    table: users,
    returnType: 'escaped-composite-literal'
  }
])

// Combine conditions with OR
const { data, error } = await supabase
  .from('users')
  .select('id, email::jsonb, name::jsonb')
  .or(`email.ilike.${searchTerms.data[0]}, name.ilike.${searchTerms.data[1]}`)
```

## Important notes

The key is in using the appropriate return type for your search terms:
- Use `composite-literal` for simple equality and pattern matching queries
- Use `escaped-composite-literal` when you need to include the search term in string-based operators like IN or OR conditions

You can use these patterns with any of Supabase's query methods like `.eq()`, `.like()`, `.ilike()`, etc.