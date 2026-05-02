## Drizzle ORM integration rules

The project uses Drizzle. Apply these rules on top of the core rules.

### Imports

```ts
import { encryptedType, extractEncryptionSchema } from '@cipherstash/stack/drizzle'
import { Encryption } from '@cipherstash/stack'
```

Do not import from `@cipherstash/stack/supabase` or `@cipherstash/stack/schema` — those are different integrations.

### Encrypted column declarations

Use `encryptedType<T>(name, opts?)` for every encrypted column. The TypeScript generic is the **plaintext** type (`string`, `number`, `boolean`, `Date`, `Record<string, unknown>`).

```ts
email: encryptedType<string>('email', { equality: true, freeTextSearch: true }),
joinedAt: encryptedType<Date>('joined_at', { dataType: 'date', orderAndRange: true }),
```

Pass the search-op options (`equality`, `orderAndRange`, `freeTextSearch`) only for ops the user actually selected during `stash init` — they are recorded in `context.json` under `columns[i].searchOps`. Do not enable an op the user did not select.

### Never on encrypted columns

- `.notNull()` — same reason as the core rule, the application writes the ciphertext.
- `.primaryKey()` — encrypted columns must not be primary keys.
- `.references(...)` / foreign keys — encrypted columns are not referential.
- `.default(...)` — Postgres defaults are plaintext; you'd be storing a plaintext literal in a JSONB ciphertext column.
- `.unique()` — uniqueness on ciphertext is not stable; use `equality` indexed search instead.

### Schema extraction + Encryption client

After the table definition, extract and instantiate exactly once per file:

```ts
const usersSchema = extractEncryptionSchema(usersTable)
export const encryptionClient = await Encryption({ schemas: [usersSchema] })
```

Multiple tables in the same encryption client → one `extractEncryptionSchema` call per table, all schemas in the array.

### Querying encrypted columns

Use the operator helpers from `@cipherstash/stack/drizzle`, not Drizzle's stock operators, when comparing against an encrypted column:

```ts
import { eq, like, ilike, gt, gte, lt, lte, between, inArray, asc, desc } from '@cipherstash/stack/drizzle'

const matches = await db
  .select()
  .from(usersTable)
  .where(eq(usersTable.email, 'alice@example.com'))
```

Mixing stock `eq` (from `drizzle-orm`) with an encrypted column is a silent bug — it compares the JSONB literal, not the underlying value.

### Migrations

When `drizzle-kit generate` produces a migration that creates an encrypted column, the column should be `jsonb` and **nullable**. If the generated migration has `NOT NULL` on an encrypted column, edit it before applying.

To install the EQL extension, the user runs `stash db install --drizzle` — do not write or run that migration yourself.
