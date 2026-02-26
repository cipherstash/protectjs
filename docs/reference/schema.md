# Encryption contract

CipherStash Encryption lets you define a contract in TypeScript that maps to your database tables and columns, and defines indexes and casting for each column which are used when searching on encrypted data.

## Table of contents

- [Creating contract files](#creating-contract-files)
- [Understanding the contract](#understanding-the-contract)
- [Defining your contract](#defining-your-contract)
  - [Searchable encryption](#searchable-encryption)
  - [Nested objects](#nested-objects)
- [Available index options](#available-index-options)
- [Initializing the Encryption client](#initializing-the-encryption-client)

## Creating contract files

You can declare your encryption contract directly in TypeScript either in a single `contract.ts` file, or you can split your contract across multiple files. It's up to you.

Example in a single file:

```
📦 <project root>
 ├ 📂 src
 │   ├ 📂 protect
 │   │  └ 📜 contract.ts
```

or in multiple files:

```
📦 <project root>
 ├ 📂 src
 │   ├ 📂 protect
 │   |   └ 📂 contracts
 │   │     └ 📜 users.ts
 │   │     └ 📜 posts.ts
```

## Understanding the contract

A contract represents a mapping of your database, specifying which columns you want to encrypt and index. It is a declarative object mapping table names to column definitions, created with `defineContract`.

The below is pseudo-code for how these mappings are defined:

```ts
import { defineContract, encrypted } from "@cipherstash/stack";

export const contract = defineContract({
  tableNameInDatabase: {
    columnNameInDatabase: encrypted({ type: 'string' }),
  },
});
```

## Defining your contract

Now that you understand how your contract is defined, let's dive into how you can configure it.

Start by importing the `defineContract` and `encrypted` functions from `@cipherstash/stack` and create a new contract with a table and column.

```ts
import { defineContract, encrypted } from "@cipherstash/stack";

export const contract = defineContract({
  users: {
    email: encrypted({ type: 'string' }),
  },
});
```

### Searchable encryption

If you are looking to enable searchable encryption in a PostgreSQL database, you must declaratively enable the indexes in your contract by setting the index options on the column.

```ts
import { defineContract, encrypted } from "@cipherstash/stack";

export const contract = defineContract({
  users: {
    email: encrypted({
      type: 'string',
      freeTextSearch: true,
      equality: true,
      orderAndRange: true,
    }),
  },
});
```

### Nested objects

CipherStash Encryption supports nested objects in your contract, allowing you to encrypt **but not search on** nested properties. You can define nested objects up to 3 levels deep.
This is useful for data stores that have less structured data, like NoSQL databases.

You can define nested objects by nesting configuration objects within the contract definition. Each leaf must specify a `type`.

> [!NOTE]
> Using nested objects is not recommended for SQL databases, as it will not be searchable.
> You should either use a JSON data type and encrypt the entire object, or use a separate column for each nested property.

```ts
import { defineContract, encrypted } from "@cipherstash/stack";

export const contract = defineContract({
  users: {
    email: encrypted({
      type: 'string',
      freeTextSearch: true,
      equality: true,
      orderAndRange: true,
    }),
    profile: {
      name: encrypted({ type: 'string' }),
      address: {
        street: encrypted({ type: 'string' }),
        location: {
          coordinates: encrypted({ type: 'string' }),
        },
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

## Data types

By default, all columns are treated as `'string'`.
Use the `type` property to specify a different plaintext data type so the encryption layer knows how to encode the value before encrypting.

```ts
import { defineContract, encrypted } from "@cipherstash/stack";

export const contract = defineContract({
  transactions: {
    amount: encrypted({ type: 'number', orderAndRange: true }),
    isActive: encrypted({ type: 'boolean' }),
    createdAt: encrypted({ type: 'date', orderAndRange: true }),
    metadata: encrypted({ type: 'json' }),
  },
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
| `'json'` | JSON objects. Automatically set when using `searchableJson: true`. |

## Available index options

The following index options are available for your contract:

| **Option** | **Description** | **SQL equivalent** |
| ----------- | --------------- | ------------------ |
| `equality: true` | Enables an exact-match index for equality queries. | `WHERE email = 'example@example.com'` |
| `freeTextSearch: true` | Enables a match index for free text and substring queries. | `WHERE description LIKE '%example%'` |
| `orderAndRange: true` | Enables sorting and range queries. | `ORDER BY price ASC` |
| `searchableJson: true` | Enables encrypted JSONB path and containment queries (recommended for JSON columns). | `WHERE metadata @> '{"role":"admin"}'` |

> [!TIP]
> For columns storing JSON data, `searchableJson: true` is the recommended index. It automatically configures the column for encrypted JSONB path and containment queries and sets the data type to `'json'`. Read more in the [JSONB queries reference](./searchable-encryption-postgres.md#jsonb-queries-with-searchablejson-recommended).

You can combine these options on a single column in any combination.

### Token filters

The `equality` option accepts an optional array of token filters that are applied before indexing:

```ts
email: encrypted({ type: 'string', equality: [{ kind: 'downcase' }] }),
```

| Filter | Description |
|--------|-------------|
| `{ kind: 'downcase' }` | Converts values to lowercase before comparison, enabling case-insensitive equality matching. |

### Free text search options

The `freeTextSearch` option accepts optional configuration:

```ts
body: encrypted({
  type: 'string',
  freeTextSearch: {
    tokenizer: { kind: 'ngram', token_length: 4 },
    k: 8,
    m: 4096,
    include_original: true,
  },
}),
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `tokenizer` | `{ kind: 'standard' }` or `{ kind: 'ngram', token_length: number }` | `{ kind: 'ngram', token_length: 3 }` | Tokenization strategy. |
| `token_filters` | `TokenFilter[]` | `[{ kind: 'downcase' }]` | Filters applied to tokens before indexing. |
| `k` | `number` | `6` | Number of hash functions for the bloom filter. |
| `m` | `number` | `2048` | Size of the bloom filter in bits. |
| `include_original` | `boolean` | `true` | Whether to include the original value in the index. |

## Type inference from contract

You can infer TypeScript types from your contract definition using the `InferPlaintext` and `InferEncrypted` utility types:

```ts
import { defineContract, encrypted } from "@cipherstash/stack";
import { type InferPlaintext, type InferEncrypted } from "@cipherstash/stack/schema";

const contract = defineContract({
  users: {
    email: encrypted({ type: 'string', equality: true }),
    name: encrypted({ type: 'string' }),
  },
});

type UserPlaintext = InferPlaintext<typeof contract.users>
// => { email: string; name: string }

type UserEncrypted = InferEncrypted<typeof contract.users>
// => { email: Encrypted; name: Encrypted }
```

## Initializing the Encryption client

You will use your defined contract to initialize the Encryption client.
Simply import your contract and pass it to the `Encryption` function.

```ts
import { Encryption } from "@cipherstash/stack";
import { contract } from "./contract";

const client = await Encryption({ contract });
```
---

### Didn't find what you wanted?

[Click here to let us know what was missing from our docs.](https://github.com/cipherstash/protectjs/issues/new?template=docs-feedback.yml&title=[Docs:]%20Feedback%20on%schema.md)
