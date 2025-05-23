# Handling encrypted data with PostgreSQL's `eql_v2_encrypted` type

> [!WARNING]
> The `eql_v2_encrypted` type is a [composite type](https://www.postgresql.org/docs/current/rowtypes.html) and each ORM/client has a different way of handling inserts and selects.
> We've collected some examples for the most popular ORMs/clients below.

## Supabase JS SDK

If you are using [Supabase JS SDK](https://github.com/supabase/supabase-js) to interact with your database, you'll need to handle encrypted data in a specific way. 
Here's how to work with it:

### Inserting encrypted data

When inserting encrypted data, you need to transform the encrypted payload into a PostgreSQL composite type using the `encryptedToPgComposite` helper:

```typescript
import { protect, csTable, csColumn, encryptedToPgComposite } from '@cipherstash/protect'

const table = csTable('your_table', {
  encrypted: csColumn('encrypted').freeTextSearch().equality().orderAndRange(),
})

const protectClient = await protect(table)

// Encrypt your data
const ciphertext = await protectClient.encrypt('sensitive data', {
  column: table.encrypted,
  table: table,
})

// Insert into Supabase
const { data, error } = await supabase
  .from('your_table')
  .insert({ encrypted: encryptedToPgComposite(ciphertext.data) })
```

### Selecting encrypted data

When selecting encrypted data, it's **highly recommended** to cast the encrypted column to JSONB using `::jsonb`.
Without this cast, the encrypted payload will be wrapped in an object with a `data` key, which requires additional handling before decryption.
This is especially important when working with models, as the decryption functions expect the raw encrypted payload:

```typescript
// ✅ Recommended way - using ::jsonb cast
// This returns the raw encrypted payload, ready for decryption
const { data, error } = await supabase
  .from('your_table')
  .select('id, encrypted::jsonb')
  .eq('id', someId)

// ❌ Without ::jsonb cast
// This returns { data: encryptedPayload }, requiring extra handling
// before decryption, especially problematic with model decryption
const { data, error } = await supabase
  .from('your_table')
  .select('id, encrypted')
```

### Working with models

For working with models that contain encrypted fields, use the `modelToEncryptedPgComposites` helper:

```typescript
const model = {
  encrypted: 'sensitive data',
  otherField: 'not encrypted',
}

const encryptedModel = await protectClient.encryptModel(model, table)

const { data, error } = await supabase
  .from('your_table')
  .insert([modelToEncryptedPgComposites(encryptedModel.data)])
```

For bulk operations with multiple models, use `bulkEncryptModels` and `bulkModelsToEncryptedPgComposites`:

```typescript
const models = [
  {
    encrypted: 'sensitive data 1',
    otherField: 'not encrypted 1',
  },
  {
    encrypted: 'sensitive data 2',
    otherField: 'not encrypted 2',
  },
]

const encryptedModels = await protectClient.bulkEncryptModels(models, table)

const { data, error } = await supabase
  .from('your_table')
  .insert(bulkModelsToEncryptedPgComposites(encryptedModels.data))
  .select('id')

// When selecting multiple records, remember to use ::jsonb
const { data: selectedData, error: selectError } = await supabase
  .from('your_table')
  .select('id, encrypted::jsonb, otherField')

// Decrypt all models at once
const decryptedModels = await protectClient.bulkDecryptModels(selectedData)
```

## Getting help

Don't see your ORM/client here? [Open an issue](https://github.com/cipherstash/protectjs/issues/new?template=docs-feedback.yml) and we'll add it to the docs!