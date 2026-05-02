## Generic PostgreSQL integration rules

The project does not use a recognised ORM. Apply these rules on top of the core rules.

### Imports

```ts
import { encryptedTable, encryptedColumn } from '@cipherstash/stack/schema'
import { Encryption } from '@cipherstash/stack'
```

### Schema definition

```ts
export const usersTable = encryptedTable('users', {
  email: encryptedColumn('email').equality().freeTextSearch(),
})

export const encryptionClient = await Encryption({ schemas: [usersTable] })
```

Only enable search ops listed for that column in `context.json`.

### Postgres column types

`jsonb`, nullable. Never `text` or `NOT NULL` on creation.

### Querying

The encryption client gives you `encrypt(plaintext)` and `decrypt(ciphertext)` methods. Use these at the application boundary:

- Before inserting/updating: encrypt the plaintext.
- After selecting: decrypt the ciphertext.
- For searches that require server-side comparison, use the EQL functions installed by `stash db install` — `eql_v2.eq`, `eql_v2.like`, `eql_v2.gt`, etc. The encryption client exposes the right shape via its query helpers; do not hand-roll JSONB path expressions.

When in doubt about which EQL function to use, read the schema partial for that integration in this skill rather than guessing.
