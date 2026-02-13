# Using CipherStash Encryption with Supabase SDK

You can encrypt data [in-use](../concepts/searchable-encryption.md) with `@cipherstash/stack` and store it in your Supabase project all while maintaining the ability to search the data without decryption.
This reference guide will show you how to do this with the Supabase SDK.

> [!NOTE]
> The following assumes you have installed the [latest version of the EQL v2 extension](https://github.com/cipherstash/encrypt-query-language/releases) which has a specific release for Supabase.

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

## Setting up encryptedSupabase

The `encryptedSupabase` wrapper makes encrypted queries look nearly identical to normal Supabase queries.
It automatically handles encryption, decryption, `::jsonb` casts, and search term formatting.

```typescript
import { Encryption } from '@cipherstash/stack'
import { encryptedSupabase } from '@cipherstash/stack/supabase'
import { encryptedTable, encryptedColumn } from '@cipherstash/stack/schema'
import { createClient } from '@supabase/supabase-js'

// 1. Define your encryption schema
const users = encryptedTable('users', {
  name: encryptedColumn('name').freeTextSearch().equality(),
  email: encryptedColumn('email').freeTextSearch().equality(),
})

// 2. Initialize the encryption client
const client = await Encryption({ schemas: [users] })

// 3. Create the Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!,
)

// 4. Create the encrypted Supabase wrapper
const eSupabase = encryptedSupabase({
  encryptionClient: client,
  supabaseClient: supabase,
})
```

### Type-safe queries

For full type safety, define a row type for your table and pass it as a generic to `.from()`:

```typescript
type UserRow = {
  id: number
  name: string
  email: string
  otherField: string
}

const { data } = await eSupabase
  .from<UserRow>('users', users)
  .select('id, name, email')

// data is typed as UserRow[] | null
// data![0].name is string
// data![0].id is number
```

The generic parameter ensures that column names and filter values are type-checked at compile time.

## Inserting data

Insert data exactly like you would with the normal Supabase SDK.
The wrapper automatically encrypts fields that match your schema and converts them to PG composite types:

```typescript
const { data, error } = await eSupabase
  .from<UserRow>('users', users)
  .insert({
    name: 'John Doe',
    email: 'john.doe@example.com',
    otherField: 'not encrypted',
  })
  .select('id')
```

For bulk inserts, pass an array:

```typescript
const { data, error } = await eSupabase
  .from<UserRow>('users', users)
  .insert([
    { name: 'John Doe', email: 'john@example.com', otherField: 'value 1' },
    { name: 'Jane Smith', email: 'jane@example.com', otherField: 'value 2' },
  ])
  .select('id')
```

## Selecting data

Select queries automatically add `::jsonb` casts to encrypted columns and decrypt the results:

```typescript
const { data, error } = await eSupabase
  .from<UserRow>('users', users)
  .select('id, email, name, otherField')

// data is already decrypted — no manual decryption needed
console.log(data![0].email) // 'john.doe@example.com'
```

> [!NOTE]
> `encryptedSupabase` does not support `select('*')`. You must list columns explicitly so that encrypted columns can be cast with `::jsonb`.

## Query examples

Filter methods like `.eq()`, `.like()`, and `.in()` automatically encrypt the search value when the column is encrypted.

### Equality search

```typescript
const { data, error } = await eSupabase
  .from<UserRow>('users', users)
  .select('id, email, name')
  .eq('email', 'john.doe@example.com')
```

### Pattern matching search

```typescript
const { data, error } = await eSupabase
  .from<UserRow>('users', users)
  .select('id, email, name')
  .ilike('email', 'example.com')
```

### IN operator search

```typescript
const { data, error } = await eSupabase
  .from<UserRow>('users', users)
  .select('id, email, name')
  .in('name', ['John Doe', 'Jane Smith'])
```

### OR condition search

You can combine multiple conditions using `.or()` with a string:

```typescript
const { data, error } = await eSupabase
  .from<UserRow>('users', users)
  .select('id, email, name')
  .or('email.ilike.example.com,name.ilike.john')
```

Or use the structured array form for better readability:

```typescript
const { data, error } = await eSupabase
  .from<UserRow>('users', users)
  .select('id, email, name')
  .or([
    { column: 'email', op: 'eq', value: 'user@example.com' },
    { column: 'name', op: 'eq', value: 'John' },
  ])
```

### Combining encrypted and non-encrypted filters

Filters on non-encrypted columns pass through to Supabase unchanged:

```typescript
const { data, error } = await eSupabase
  .from<UserRow>('users', users)
  .select('id, email, name')
  .eq('email', 'john@example.com')  // encrypted — auto-encrypts search term
  .eq('otherField', 'some value')   // not encrypted — passed through as-is
```

## Updating data

```typescript
const { data, error } = await eSupabase
  .from<UserRow>('users', users)
  .update({ email: 'new@example.com' })
  .eq('id', 1)
  .select('id, email')
```

## Upserting data

```typescript
const { data, error } = await eSupabase
  .from<UserRow>('users', users)
  .upsert({
    id: 1,
    name: 'John Doe',
    email: 'john@example.com',
    otherField: 'updated',
  })
  .select('id, email')
```

## Deleting data

```typescript
const { error } = await eSupabase
  .from<UserRow>('users', users)
  .delete()
  .eq('id', 1)
```

## Insert with returning

Chain `.select()` after a mutation to return the inserted/updated rows (decrypted):

```typescript
const { data, error } = await eSupabase
  .from<UserRow>('users', users)
  .insert({ name: 'John', email: 'john@example.com', otherField: 'value' })
  .select('id, email')
  .single()
```

## Transforms

All Supabase transform methods are supported as pass-throughs:

```typescript
const { data, error } = await eSupabase
  .from<UserRow>('users', users)
  .select('id, email, name')
  .eq('name', 'John')
  .order('id', { ascending: false })
  .limit(10)
  .range(0, 9)
```

## Lock context and audit

You can attach a lock context or audit metadata to any query:

```typescript
import { LockContext } from '@cipherstash/stack/identity'

const lc = new LockContext()
const lockContext = await lc.identify(userJwt)

const { data, error } = await eSupabase
  .from<UserRow>('users', users)
  .select('id, email, name')
  .eq('email', 'john@example.com')
  .withLockContext(lockContext)
  .audit({ metadata: { userId: 'user_123' } })
```

## Error handling

The wrapper returns `{ data, error }` matching the Supabase SDK convention.
Encryption errors are surfaced through the same shape with an additional `encryptionError` field:

```typescript
const { data, error } = await eSupabase
  .from<UserRow>('users', users)
  .select('id, email')
  .eq('email', 'john@example.com')

if (error) {
  console.error(error.message)

  // If the error was caused by encryption/decryption
  if (error.encryptionError) {
    console.error('Encryption error:', error.encryptionError)
  }
}
```

## Exposing EQL schema

These instructions are referenced from the [Supabase docs](https://supabase.com/docs/guides/api/using-custom-schemas) and are used to expose the EQL schema to the Supabase SDK.

1. Go to [API settings](https://supabase.com/dashboard/project/_/settings/api) and add `eql_v2` to "Exposed schemas".
2. Then run the following in the Supabase project as raw SQL:

```sql
GRANT USAGE ON SCHEMA eql_v2 TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA eql_v2 TO anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA eql_v2 TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA eql_v2 TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA eql_v2 GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA eql_v2 GRANT ALL ON ROUTINES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA eql_v2 GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
```

## How it works

Under the hood, `encryptedSupabase` uses a deferred query builder pattern.
All chained operations (`.select()`, `.eq()`, `.insert()`, etc.) are recorded synchronously.
When the query is `await`ed, the builder:

1. **Encrypts mutation data** — calls `encryptModel` / `bulkEncryptModels` and converts to PG composites
2. **Adds `::jsonb` casts** — parses your select string and adds `::jsonb` to encrypted columns
3. **Batch-encrypts filter values** — collects all filter values for encrypted columns and encrypts them in a single `encryptQuery()` call (one round-trip to ZeroKMS)
4. **Executes the real Supabase query** — chains all operations on the underlying Supabase client
5. **Decrypts results** — calls `decryptModel` / `bulkDecryptModels` on the returned data
