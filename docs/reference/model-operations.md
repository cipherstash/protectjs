# Model operations

Model operations in `@cipherstash/stack` provide a high-level interface for encrypting and decrypting entire objects. 
These operations automatically handle the encryption of fields defined in your schema while preserving other fields.

## Table of contents

- [Basic model operations](#basic-model-operations)
  - [Encrypting a model](#encrypting-a-model)
  - [Decrypting a model](#decrypting-a-model)
- [Bulk model operations](#bulk-model-operations)
  - [Bulk encryption](#bulk-encryption)
  - [Bulk decryption](#bulk-decryption)
- [Type safety](#type-safety)
  - [Using type parameters](#using-type-parameters)
  - [Type inference from schema](#type-inference-from-schema)
- [Identity-aware model operations](#identity-aware-model-operations)
- [Error handling](#error-handling)

## Basic model operations

### Encrypting a model

The `encryptModel` method encrypts fields in your model that are defined in your schema while leaving other fields unchanged.

```typescript
import { client } from "./protect";
import { users } from "./protect/schema";

const user = {
  id: "1",
  email: "user@example.com", // Will be encrypted (defined in schema)
  address: "123 Main St", // Will be encrypted (defined in schema)
  createdAt: new Date(), // Will remain unchanged
  metadata: { role: "admin" }, // Will remain unchanged
};

const encryptedResult = await client.encryptModel(user, users);

if (encryptedResult.failure) {
  console.error("Encryption failed:", encryptedResult.failure.message);
  return;
}

const encryptedUser = encryptedResult.data;
// Result: {
//   id: '1',
//   email: { c: 'encrypted_data...' },
//   address: { c: 'encrypted_data...' },
//   createdAt: Date,
//   metadata: { role: 'admin' }
// }
```

### Decrypting a model

The `decryptModel` method automatically detects and decrypts any encrypted fields in your model.

```typescript
const decryptedResult = await client.decryptModel(encryptedUser);

if (decryptedResult.failure) {
  console.error("Decryption failed:", decryptedResult.failure.message);
  return;
}

const decryptedUser = decryptedResult.data;
// Result: Original model with decrypted values
```

## Bulk model operations

For better performance when working with multiple models, use these bulk encryption methods.

### Bulk encryption

```typescript
const users = [
  {
    id: "1",
    email: "user1@example.com",
    address: "123 Main St",
  },
  {
    id: "2",
    email: "user2@example.com",
    address: "456 Oak Ave",
  },
];

const encryptedResult = await client.bulkEncryptModels(users, users);

if (encryptedResult.failure) {
  console.error("Bulk encryption failed:", encryptedResult.failure.message);
  return;
}

const encryptedUsers = encryptedResult.data;
```

### Bulk decryption

```typescript
const decryptedResult = await client.bulkDecryptModels(encryptedUsers);

if (decryptedResult.failure) {
  console.error("Bulk decryption failed:", decryptedResult.failure.message);
  return;
}

const decryptedUsers = decryptedResult.data;
```

## Type safety

### Schema-aware return types (recommended)

`encryptModel` and `bulkEncryptModels` return **contract-aware types** when you let TypeScript infer the type parameters from the arguments.
Fields matching the contract are typed as `Encrypted`, while other fields retain their original types:

```typescript
import { defineContract, encrypted } from "@cipherstash/stack";

type User = {
  id: string;
  email: string;
  address: string;
  createdAt: Date;
};

const contract = defineContract({
  users: {
    email: encrypted({ type: "string", freeTextSearch: true }),
    address: encrypted({ type: "string" }),
  },
});

// Let TypeScript infer the return type from the contract
const encryptedResult = await client.encryptModel(user, contract.users);

// encryptedResult.data.email  -> Encrypted (contract field)
// encryptedResult.data.address -> Encrypted (contract field)
// encryptedResult.data.id      -> string    (not in contract)
// encryptedResult.data.createdAt -> Date    (not in contract)

// Decryption works the same way
const decryptedResult = await client.decryptModel(encryptedResult.data);

// Bulk operations
const bulkEncryptedResult = await client.bulkEncryptModels(userModels, contract.users);
const bulkDecryptedResult = await client.bulkDecryptModels(
  bulkEncryptedResult.data
);
```

The type system ensures:

- Contract-defined fields are typed as `Encrypted` in the return value
- Non-contract fields retain their original types
- Preservation of nested object structures

### Using explicit type parameters

You can still pass an explicit type parameter for backward compatibility. When you do, the contract type parameter defaults to the widened type, and the return type degrades gracefully to your provided type (same behavior as before):

```typescript
// Explicit type parameter — return type is User (no contract-aware mapping)
const result = await client.encryptModel<User>(user, contract.users);

// For full contract-aware types with explicit parameters, provide both:
const result = await client.encryptModel<User, typeof contract.users>(user, contract.users);
```

> [!TIP]
> For the best developer experience, omit the type parameter and let TypeScript infer the contract-aware return type from the `table` argument.

## Identity-aware model operations

All model operations support lock contexts for identity-aware encryption:

```typescript
// Single model operations
const encryptedResult = await client
  .encryptModel(user, users)
  .withLockContext(lockContext);

const decryptedResult = await client
  .decryptModel(encryptedUser)
  .withLockContext(lockContext);

// Bulk operations
const bulkEncryptedResult = await client
  .bulkEncryptModels(userModels, users)
  .withLockContext(lockContext);

const bulkDecryptedResult = await client
  .bulkDecryptModels(encryptedUsers)
  .withLockContext(lockContext);
```

## Error handling

All model operations return a `Result` type that includes either a `data` or `failure` property:

```typescript
const result = await client.encryptModel(user, users);

if (result.failure) {
  // Handle specific error types
  switch (result.failure.type) {
    case "EncryptionError":
      console.error("Encryption failed:", result.failure.message);
      break;
    case "ClientInitError":
      console.error("Client not initialized:", result.failure.message);
      break;
    case "LockContextError":
      console.error("Lock context error:", result.failure.message);
      break;
    default:
      console.error("Unknown error:", result.failure.message);
  }
  return;
}

// Success case
const encryptedData = result.data;
```

Common error types:

- `EncryptionError`: Errors during encryption
- `DecryptionError`: Errors during decryption
- `ClientInitError`: Client initialization issues
- `LockContextError`: Lock context-related errors

> [!TIP]
> Always handle both the success and failure cases when working with model operations. The `Result` type ensures you don't accidentally ignore error cases.
>
> ---

### Didn't find what you wanted?

[Click here to let us know what was missing from our docs.](https://github.com/cipherstash/protectjs/issues/new?template=docs-feedback.yml&title=[Docs:]%20Feedback%20on%model-operations.md)
