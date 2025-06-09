# Protect.js schema

Protect.js lets you define a schema in TypeScript with properties that map to your database columns, and define indexes and casting for each column which are used when searching on encrypted data.

## Table of contents

- [Creating schema files](#creating-schema-files)
- [Understanding schema files](#understanding-schema-files)
- [Defining your schema](#defining-your-schema)
  - [Searchable encryption](#searchable-encryption)
  - [Nested objects](#nested-objects)
- [Available index options](#available-index-options)
- [Initializing the Protect client](#initializing-the-protect-client)

## Creating schema files

You can declare your Protect.js schema directly in TypeScript either in a single `schema.ts` file, or you can split your schema into multiple files. It's up to you.

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

A schema represents a mapping of your database, and which columns you want to encrypt and index. Thus, it's a collection of tables and columns represented with `csTable` and `csColumn`.

The below is pseudo-code for how these mappings are defined:

```ts
import { csTable, csColumn } from "@cipherstash/protect";

export const tableNameInTypeScript = csTable("tableNameInDatabase", {
  columnNameInTypeScript: csColumn("columnNameInDatabase"),
});
```

## Defining your schema

Now that you understand how your schema is defined, let's dive into how you can configure your schema.

Start by importing the `csTable` and `csColumn` functions from `@cipherstash/protect` and create a new table with a column.

```ts
import { csTable, csColumn } from "@cipherstash/protect";

export const protectedUsers = csTable("users", {
  email: csColumn("email"),
});
```

### Searchable encryption

If you are looking to enable searchable encryption in a PostgreSQL database, you must declaratively enable the indexes in your schema by chaining the index options to the column.

```ts
import { csTable, csColumn } from "@cipherstash/protect";

export const protectedUsers = csTable("users", {
  email: csColumn("email").freeTextSearch().equality().orderAndRange(),
});
```

### Nested objects

Protect.js supports nested objects in your schema, allowing you to encrypt and search on nested properties. You can define nested objects up to 3 levels deep.

```ts
import { csTable, csColumn } from "@cipherstash/protect";

export const protectedUsers = csTable("users", {
  email: csColumn("email").freeTextSearch().equality().orderAndRange(),
  profile: {
    name: csColumn("name").freeTextSearch(),
    address: {
      street: csColumn("street").freeTextSearch(),
      location: {
        coordinates: csColumn("coordinates").equality(),
      },
    },
  },
});
```

When working with nested objects:
- Each level can have its own encrypted fields
- Index options can be applied to any level of nesting
- The maximum nesting depth is 3 levels
- Null and undefined values are supported at any level
- Optional nested objects are supported

## Available index options

The following index options are available for your schema:

| **Method** | **Description** | **SQL equivalent** |
| ----------- | --------------- | ------------------ |
| equality   | Enables a exact index for equality queries. | `WHERE email = 'example@example.com'` |
| freeTextSearch   | Enables a match index for free text queries. | `WHERE description LIKE '%example%'` |
| orderAndRange   | Enables an sorting and range queries index. | `ORDER BY price ASC` |

You can chain these methods to your column to configure them in any combination.

## Initializing the Protect client

You will use your defined schemas to initialize the EQL client.
Simply import your schemas and pass them to the `protect` function.

```ts
import { protect, type ProtectClientConfig } from "@cipherstash/protect";
import { protectedUsers } from "./schemas/users";

const config: ProtectClientConfig = {
  schemas: [protectedUsers], // At least one csTable is required
}

const protectClient = await protect(config);
```
---

### Didn't find what you wanted?

[Click here to let us know what was missing from our docs.](https://github.com/cipherstash/protectjs/issues/new?template=docs-feedback.yml&title=[Docs:]%20Feedback%20on%schema.md)
