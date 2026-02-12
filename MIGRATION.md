# Migration Guide: `@cipherstash/protect` to `@cipherstash/stack`

This guide covers migrating from `@cipherstash/protect` to `@cipherstash/stack`. All old names are preserved as deprecated aliases, so your existing code will continue to work. However, we recommend updating to the new names to stay current.

## 1. Update your dependencies

Replace `@cipherstash/protect` with `@cipherstash/stack`:

```bash
# Remove the old package
npm uninstall @cipherstash/protect

# Install the new package
npm install @cipherstash/stack
```

If you use the DynamoDB helpers, update the peer dependency:

```bash
# @cipherstash/dynamodb now expects @cipherstash/stack
npm install @cipherstash/stack @cipherstash/dynamodb
```

If you use the Drizzle integration, update the peer dependency:

```bash
npm install @cipherstash/stack @cipherstash/drizzle
```

## 2. Update your imports

### Package imports

| Before | After |
|--------|-------|
| `from '@cipherstash/protect'` | `from '@cipherstash/stack'` |
| `from '@cipherstash/protect/client'` | `from '@cipherstash/stack/client'` |
| `from '@cipherstash/protect/identify'` | `from '@cipherstash/stack/identity'` |

### Named imports

| Before | After |
|--------|-------|
| `protect` | `Encryption` |
| `csTable` | `encryptedTable` |
| `csColumn` | `encryptedColumn` |
| `csValue` | `encryptedValue` |

### Type imports

| Before | After |
|--------|-------|
| `ProtectClient` | `EncryptionClient` |
| `ProtectClientConfig` | `EncryptionClientConfig` |
| `ProtectError` | `EncryptionError` |
| `ProtectErrorTypes` | `EncryptionErrorTypes` |
| `ProtectTable<T>` | `EncryptedTable<T>` |
| `ProtectColumn` | `EncryptedColumn` |
| `ProtectValue` | `EncryptedValue` |
| `ProtectTableColumn` | `EncryptedTableColumn` |
| `ProtectOperation<T>` | `EncryptionOperation<T>` |

## 3. Update your code

### Schema definition

```diff
-import { csTable, csColumn } from '@cipherstash/protect'
+import { encryptedTable, encryptedColumn } from '@cipherstash/stack'

-const users = csTable('users', {
-  email: csColumn('email').equality().freeTextSearch(),
-  age: csColumn('age').dataType('number').orderAndRange(),
+const users = encryptedTable('users', {
+  email: encryptedColumn('email').equality().freeTextSearch(),
+  age: encryptedColumn('age').dataType('number').orderAndRange(),
 })
```

### Client initialization

```diff
-import { protect, type ProtectClientConfig } from '@cipherstash/protect'
+import { Encryption, type EncryptionClientConfig } from '@cipherstash/stack'

-const config: ProtectClientConfig = {
+const config: EncryptionClientConfig = {
   schemas: [users],
 }

-const client = await protect(config)
+const client = await Encryption(config)
```

### Identity / Lock context

```diff
-import { LockContext } from '@cipherstash/protect/identify'
+import { LockContext } from '@cipherstash/stack/identity'
```

### Error handling

```diff
-import { ProtectErrorTypes } from '@cipherstash/protect'
+import { EncryptionErrorTypes } from '@cipherstash/stack'

 if (result.failure) {
-  if (result.failure.type === ProtectErrorTypes.EncryptionError) {
+  if (result.failure.type === EncryptionErrorTypes.EncryptionError) {
     // handle encryption error
   }
 }
```

### Drizzle integration

```diff
-import { protect } from '@cipherstash/protect'
+import { Encryption } from '@cipherstash/stack'
-import { extractProtectSchema, createProtectOperators } from '@cipherstash/drizzle/pg'
+import { extractEncryptionSchema, createEncryptionOperators } from '@cipherstash/drizzle/pg'

-const users = extractProtectSchema(usersTable)
+const users = extractEncryptionSchema(usersTable)
-const client = await protect({ schemas: [users] })
+const client = await Encryption({ schemas: [users] })
-const ops = createProtectOperators(client)
+const ops = createEncryptionOperators(client)
```

### DynamoDB integration

```diff
-import { protect, csTable, csColumn } from '@cipherstash/protect'
+import { Encryption, encryptedTable, encryptedColumn } from '@cipherstash/stack'
-import { protectDynamoDB } from '@cipherstash/protect-dynamodb'
+import { encryptedDynamoDB } from '@cipherstash/dynamodb'

-const users = csTable('users', {
-  email: csColumn('email').equality(),
+const users = encryptedTable('users', {
+  email: encryptedColumn('email').equality(),
 })

-const client = await protect({ schemas: [users] })
+const client = await Encryption({ schemas: [users] })
-const dynamo = protectDynamoDB({ protectClient: client })
+const dynamo = encryptedDynamoDB({ encryptionClient: client })
```

## 4. Deprecated aliases

All old names continue to work as deprecated aliases. Your IDE will show strikethrough on deprecated names, and TypeScript will emit deprecation warnings. There is no runtime behavior change when using deprecated aliases.

You can migrate incrementally — old and new names can coexist in the same codebase.

## 5. What hasn't changed

- The `Result` contract (`{ data }` or `{ failure }`) is unchanged
- EQL payload shapes are unchanged
- The `.withLockContext()` chaining pattern is unchanged
- All encryption, decryption, and search operations work identically
- Environment variables (`CS_WORKSPACE_CRN`, `CS_CLIENT_ID`, etc.) are unchanged
- The `@cipherstash/protect-ffi` native module is still used internally

## 6. Find and replace cheat sheet

For a quick migration, run these find-and-replace operations across your codebase:

```
@cipherstash/protect/identify  →  @cipherstash/stack/identity
@cipherstash/protect/client    →  @cipherstash/stack/client
@cipherstash/protect           →  @cipherstash/stack
csTable(                       →  encryptedTable(
csColumn(                      →  encryptedColumn(
csValue(                       →  encryptedValue(
protect({                      →  Encryption({
await protect(                 →  await Encryption(
ProtectClientConfig            →  EncryptionClientConfig
ProtectClient                  →  EncryptionClient
ProtectErrorTypes              →  EncryptionErrorTypes
ProtectError                   →  EncryptionError
ProtectTable                   →  EncryptedTable
ProtectColumn                  →  EncryptedColumn
ProtectValue                   →  EncryptedValue
ProtectTableColumn             →  EncryptedTableColumn
ProtectOperation               →  EncryptionOperation
extractProtectSchema           →  extractEncryptionSchema
createProtectOperators         →  createEncryptionOperators
@cipherstash/protect-dynamodb  →  @cipherstash/dynamodb
protectDynamoDB                →  encryptedDynamoDB
protectClient                  →  encryptionClient
```

> **Important**: Run the more specific replacements first (e.g., `@cipherstash/protect/identify` before `@cipherstash/protect`) to avoid partial matches.
