# Searchable encryption with Protect.js and PostgreSQL

This reference guide outlines the different query patterns you can use to search encrypted data with Protect.js.

## Table of contents

- [Before you start](#before-you-start)
- [Query examples](#query-examples)

## Before you start

You will have needed to [define your schema and initialized the protect client](../../README.md#defining-your-schema), and have [installed the EQL custom types and functions](../../README.md#searchable-encryption-in-postgresql).

The below examples assume you have a schema defined:

```ts
import { csTable, csColumn } from '@cipherstash/protect'

export const protectedUsers = csTable('users', {
  email: csColumn('email').equality().freeTextSearch().orderAndRange(),
})
```

> [!TIP]
> To see an example using the [Drizzle ORM](https://github.com/drizzle-team/drizzle-orm) see the example [here](../../apps/drizzle/src/select.ts).

## Query examples

TODO: flesh this out (sorry it's not done yet!)

---

### Didn't find what you wanted?

[Click here to let us know what was missing from our docs.](https://github.com/cipherstash/protectjs/issues/new?template=docs-feedback.yml&title=[Docs:]%20Feedback%20on%searchable-encryption-postgres.md)
