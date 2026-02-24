# Encryption schema

CipherStash Encryption lets you define a schema in TypeScript with properties that map to your database columns, and define indexes and casting for each column which are used when searching on encrypted data.

## Table of contents

- [Creating schema files](#creating-schema-files)
- [Understanding schema files](#understanding-schema-files)
- [Defining your schema](#defining-your-schema)
  - [Searchable encryption](#searchable-encryption)
  - [Nested objects](#nested-objects)
- [Available index options](#available-index-options)
- [Initializing the Encryption client](#initializing-the-encryption-client)

## Creating schema files

You can declare your encryption schema directly in TypeScript either in a single `schema.ts` file, or you can split your schema into multiple files. It's up to you.

Example in a single file:

```
📦 <project root>
 ├ 📂 src
 │   ├ 📂 protect
 │   │  └ 📜 schema.ts
```

or in multiple files:

```
📦 <project root>
 ├ 📂 src
 │   ├ 📂 protect
 │   |   └ 📂 schemas
 │   │     └ 📜 users.ts
 │   │     └ 📜 posts.ts
```

## Understanding schema files

A schema represents a mapping of your database, and which columns you want to encrypt and index. Thus, it's a collection of tables and columns represented with `encryptedTable` and `encryptedColumn`.

The below is pseudo-code for how these mappings are defined:

```ts
import { encryptedTable, encryptedColumn } from "@cipherstash/stack/schema";

export const tableNameInTypeScript = encryptedTable("tableNameInDatabase", {
  columnNameInTypeScript: encryptedColumn("columnNameInDatabase"),
});
```

## Defining your schema

Now that you understand how your schema is defined, let's dive into how you can configure your schema.

Start by importing the `encryptedTable` and `encryptedColumn` functions from `@cipherstash/stack/schema` and create a new table with a column.

```ts
import { encryptedTable, encryptedColumn } from "@cipherstash/stack/schema";

export const protectedUsers = encryptedTable("users", {
  email: encryptedColumn("email"),
});
```

### Searchable encryption

If you are looking to enable searchable encryption in a PostgreSQL database, you must declaratively enable the indexes in your schema by chaining the index options to the column.

```ts
import { encryptedTable, encryptedColumn } from "@cipherstash/stack/schema";

export const protectedUsers = encryptedTable("users", {
  email: encryptedColumn("email").freeTextSearch().equality().orderAndRange(),
});
```

### Nested objects

CipherStash Encryption supports nested objects in your schema, allowing you to encrypt **but not search on** nested properties. You can define nested objects up to 3 levels deep.
This is useful for data stores that have less structured data, like NoSQL databases.

You can define nested objects by using the `encryptedField` function to define a value in a nested object. The value naming convention of the `encryptedField` function is a dot-separated string of the nested object path, e.g. `profile.name` or `profile.address.street`.

> [!NOTE]
> Using nested objects is not recommended for SQL databases, as it will not be searchable.
> You should either use a JSON data type and encrypt the entire object, or use a separate column for each nested property.

```ts
import { encryptedTable, encryptedColumn, encryptedField } from "@cipherstash/stack/schema";

export const protectedUsers = encryptedTable("users", {
  email: encryptedColumn("email").freeTextSearch().equality().orderAndRange(),
  profile: {
    name: encryptedField("profile.name"),
    address: {
      street: encryptedField("profile.address.street"),
      location: {
        coordinates: encryptedField("profile.address.location.coordinates"),
      },
    },
  },
});
```

When working with nested objects:
- Searchable encryption is not supported on nested objects
- Each level can have its own encrypted fields
- The maximum nesting depth is 3 levels
- Null and undefined values are supported at any level
- Optional nested objects are supported

> [!WARNING]
> TODO: The schema builder does not validate the values you supply to the `encryptedField` or `encryptedColumn` functions.
> These values are meant to be unique, and cause unexpected behavior if they are not defined correctly.

## Data types

By default, all columns are treated as `'string'`.
Use the `.dataType()` method to specify a different plaintext data type so the encryption layer knows how to encode the value before encrypting.

```ts
import { encryptedTable, encryptedColumn } from "@cipherstash/stack/schema";

export const transactions = encryptedTable("transactions", {
  amount: encryptedColumn("amount").dataType("number").orderAndRange(),
  isActive: encryptedColumn("is_active").dataType("boolean"),
  createdAt: encryptedColumn("created_at").dataType("date").orderAndRange(),
  metadata: encryptedColumn("metadata").dataType("json"),
});
```

### Available data types

| Data type | Description |
|-----------|-------------|
| `'string'` | Text values. This is the default. |
| `'number'` | Numeric values (integers and floats). |
| `'boolean'` | Boolean `true` / `false` values. |
| `'date'` | Date or timestamp values. |
| `'bigint'` | Large integer values. |
| `'json'` | JSON objects. Automatically set when using `.searchableJson()`. |

## Available index options

The following index options are available for your schema:

| **Method** | **Description** | **SQL equivalent** |
| ----------- | --------------- | ------------------ |
| `.equality()` | Enables an exact-match index for equality queries. | `WHERE email = 'example@example.com'` |
| `.freeTextSearch()` | Enables a match index for free text and substring queries. | `WHERE description LIKE '%example%'` |
| `.orderAndRange()` | Enables sorting and range queries. | `ORDER BY price ASC` |
| `.searchableJson()` | Enables encrypted JSONB path and containment queries (recommended for JSON columns). | `WHERE metadata @> '{"role":"admin"}'` |

> [!TIP]
> For columns storing JSON data, `.searchableJson()` is the recommended index. It automatically configures the column for encrypted JSONB path and containment queries and sets the data type to `'json'`. Read more in the [JSONB queries reference](./searchable-encryption-postgres.md#jsonb-queries-with-searchablejson-recommended).

You can chain these methods to your column to configure them in any combination.

### Token filters

The `.equality()` method accepts an optional array of token filters that are applied before indexing:

```ts
email: encryptedColumn("email").equality([{ kind: 'downcase' }]),
```

| Filter | Description |
|--------|-------------|
| `{ kind: 'downcase' }` | Converts values to lowercase before comparison, enabling case-insensitive equality matching. |

### Free text search options

The `.freeTextSearch()` method accepts optional configuration:

```ts
body: encryptedColumn("body").freeTextSearch({
  tokenizer: { kind: 'ngram', token_length: 4 },
  k: 8,
  m: 4096,
  include_original: true,
}),
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `tokenizer` | `{ kind: 'standard' }` or `{ kind: 'ngram', token_length: number }` | `{ kind: 'ngram', token_length: 3 }` | Tokenization strategy. |
| `token_filters` | `TokenFilter[]` | `[{ kind: 'downcase' }]` | Filters applied to tokens before indexing. |
| `k` | `number` | `6` | Number of hash functions for the bloom filter. |
| `m` | `number` | `2048` | Size of the bloom filter in bits. |
| `include_original` | `boolean` | `true` | Whether to include the original value in the index. |

## Type inference from schema

You can infer TypeScript types from your schema definition using the `InferPlaintext` and `InferEncrypted` utility types:

```ts
import { encryptedTable, encryptedColumn, type InferPlaintext, type InferEncrypted } from "@cipherstash/stack/schema";

const users = encryptedTable("users", {
  email: encryptedColumn("email").equality(),
  name: encryptedColumn("name"),
});

type UserPlaintext = InferPlaintext<typeof users>
// => { email: string; name: string }

type UserEncrypted = InferEncrypted<typeof users>
// => { email: Encrypted; name: Encrypted }
```

## Initializing the Encryption client

You will use your defined schemas to initialize the EQL client.
Simply import your schemas and pass them to the `Encryption` function.

```ts
import { Encryption } from "@cipherstash/stack";
import { protectedUsers } from "./schemas/users";

const client = await Encryption({ schemas: [protectedUsers] });
```
---

### Didn't find what you wanted?

[Click here to let us know what was missing from our docs.](https://github.com/cipherstash/protectjs/issues/new?template=docs-feedback.yml&title=[Docs:]%20Feedback%20on%schema.md)
