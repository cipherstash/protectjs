# Stash Encryption schema

Stash Encryption lets you define a schema in TypeScript with properties that map to your database columns, and define indexes and casting for each column which are used when searching on encrypted data.

## Table of contents

- [Creating schema files](#creating-schema-files)
- [Understanding schema files](#understanding-schema-files)
- [Defining your schema](#defining-your-schema)
  - [Searchable encryption](#searchable-encryption)
  - [Nested objects](#nested-objects)
- [Available index options](#available-index-options)
- [Initializing the Encryption client](#initializing-the-encryption-client)

## Creating schema files

You can declare your Stash Encryption schema directly in TypeScript either in a single `schema.ts` file, or you can split your schema into multiple files. It's up to you.

Example in a single file:

```
📦 <project root>
 ├ 📂 src
 │   ├ 📂 encryption
 │   │  └ 📜 schema.ts
```

or in multiple files:

```
📦 <project root>
 ├ 📂 src
 │   ├ 📂 encryption
 │   |   └ 📂 schemas
 │   │     └ 📜 users.ts
 │   │     └ 📜 posts.ts
```

## Understanding schema files

A schema represents a mapping of your database, and which columns you want to encrypt and index. Thus, it's a collection of tables and columns represented with `encryptedTable` and `encryptedColumn`.

The below is pseudo-code for how these mappings are defined:

```ts
import { encryptedTable, encryptedColumn } from "@cipherstash/stack";

export const tableNameInTypeScript = encryptedTable("tableNameInDatabase", {
  columnNameInTypeScript: encryptedColumn("columnNameInDatabase"),
});
```

## Defining your schema

Now that you understand how your schema is defined, let's dive into how you can configure your schema.

Start by importing the `encryptedTable` and `encryptedColumn` functions from `@cipherstash/stack` and create a new table with a column.

```ts
import { encryptedTable, encryptedColumn } from "@cipherstash/stack";

export const encryptedUsers = encryptedTable("users", {
  email: encryptedColumn("email"),
});
```

### Searchable encryption

If you are looking to enable searchable encryption in a PostgreSQL database, you must declaratively enable the indexes in your schema by chaining the index options to the column.

```ts
import { encryptedTable, encryptedColumn } from "@cipherstash/stack";

export const encryptedUsers = encryptedTable("users", {
  email: encryptedColumn("email").freeTextSearch().equality().orderAndRange(),
});
```

### Nested objects

Stash Encryption supports nested objects in your schema, allowing you to encrypt **but not search on** nested properties. You can define nested objects up to 3 levels deep.
This is useful for data stores that have less structured data, like NoSQL databases.

You can define nested objects by using the `encryptedValue` function to define a value in a nested object. The value naming convention of the `encryptedValue` function is a dot-separated string of the nested object path, e.g. `profile.name` or `profile.address.street`.

> [!NOTE]
> Using nested objects is not recommended for SQL databases, as it will not be searchable.
> You should either use a JSON data type and encrypt the entire object, or use a separate column for each nested property.

```ts
import { encryptedTable, encryptedColumn, encryptedValue } from "@cipherstash/stack";

export const encryptedUsers = encryptedTable("users", {
  email: encryptedColumn("email").freeTextSearch().equality().orderAndRange(),
  profile: {
    name: encryptedValue("profile.name"),
    address: {
      street: encryptedValue("profile.address.street"),
      location: {
        coordinates: encryptedValue("profile.address.location.coordinates"),
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
> TODO: The schema builder does not validate the values you supply to the `encryptedValue` or `encryptedColumn` functions.
> These values are meant to be unique, and and cause unexpected behavior if they are not defined correctly.

## Available index options

The following index options are available for your schema:

| **Method** | **Description** | **SQL equivalent** |
| ----------- | --------------- | ------------------ |
| equality   | Enables a exact index for equality queries. | `WHERE email = 'example@example.com'` |
| freeTextSearch   | Enables a match index for free text queries. | `WHERE description LIKE '%example%'` |
| orderAndRange   | Enables an sorting and range queries index. | `ORDER BY price ASC` |
| searchableJson | Enables encrypted JSONB path and containment queries (recommended for JSON columns). | `WHERE metadata @> '{"role":"admin"}'` |

> [!TIP]
> For columns storing JSON data, `.searchableJson()` is the recommended index. It automatically configures the column for encrypted JSONB path and containment queries. Read more in the [JSONB queries reference](./searchable-encryption-postgres.md#jsonb-queries-with-searchablejson-recommended).

You can chain these methods to your column to configure them in any combination.

## Initializing the Encryption client

You will use your defined schemas to initialize the EQL client.
Simply import your schemas and pass them to the `Encryption` function.

```ts
import { Encryption, type EncryptionClientConfig } from "@cipherstash/stack";
import { encryptedUsers } from "./schemas/users";

const config: EncryptionClientConfig = {
  schemas: [encryptedUsers], // At least one encryptedTable is required
}

const encryptionClient = await Encryption(config);
```
---

### Didn't find what you wanted?

[Click here to let us know what was missing from our docs.](https://github.com/cipherstash/protectjs/issues/new?template=docs-feedback.yml&title=[Docs:]%20Feedback%20on%schema.md)
