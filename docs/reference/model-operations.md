# Model operations

Model operations in Stash Encryption provide a high-level interface for encrypting and decrypting entire objects. 
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
import { encryptionClient } from "./protect";
import { users } from "./protect/schema";

const user = {
  id: "1",
  email: "user@example.com", // Will be encrypted (defined in schema)
  address: "123 Main St", // Will be encrypted (defined in schema)
  createdAt: new Date(), // Will remain unchanged
  metadata: { role: "admin" }, // Will remain unchanged
};

const encryptedResult = await encryptionClient.encryptModel(user, users);

if (encryptedResult.failure) {
  console.error("Encryption failed:", encryptedResult.failure.message);
  return;
}

const encryptedUser = encryptedResult.data;
// Result: {
//   id: '1',
//   email: { k: 'ct', c: 'encrypted_data...' },
//   address: { k: 'ct', c: 'encrypted_data...' },
//   createdAt: Date,
//   metadata: { role: 'admin' }
// }
```

### Decrypting a model

The `decryptModel` method automatically detects and decrypts any encrypted fields in your model.

```typescript
const decryptedResult = await encryptionClient.decryptModel(encryptedUser);

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

const encryptedResult = await encryptionClient.bulkEncryptModels(users, users);

if (encryptedResult.failure) {
  console.error("Bulk encryption failed:", encryptedResult.failure.message);
  return;
}

const encryptedUsers = encryptedResult.data;
```

### Bulk decryption

```typescript
const decryptedResult = await encryptionClient.bulkDecryptModels(encryptedUsers);

if (decryptedResult.failure) {
  console.error("Bulk decryption failed:", decryptedResult.failure.message);
  return;
}

const decryptedUsers = decryptedResult.data;
```

## Type safety

### Using type parameters

Stash Encryption provides strong TypeScript support through generic type parameters:

```typescript
// Define your model type
type User = {
  id: string;
  email: string | null;
  address: string | null;
  createdAt: Date;
  metadata?: {
    preferences?: {
      notifications: boolean;
      theme: string;
    };
  };
};

// Use the type parameter for type safety
const encryptedResult = await encryptionClient.encryptModel<User>(user, users);
const decryptedResult = await encryptionClient.decryptModel<User>(encryptedUser);

// Bulk operations
const bulkEncryptedResult = await encryptionClient.bulkEncryptModels<User>(
  userModels,
  users
);
const bulkDecryptedResult =
  await encryptionClient.bulkDecryptModels<User>(encryptedUsers);
```

The type system ensures:

- Type safety for input models
- Correct handling of optional and nullable fields
- Preservation of nested object structures
- Type safety for encrypted and decrypted results

### Type inference from schema

The model operations can infer types from your schema definition:

```typescript
const users = encryptedTable("users", {
  email: encryptedColumn("email").freeTextSearch(),
  address: encryptedColumn("address"),
});

// Types are inferred from the schema
const result = await encryptionClient.encryptModel(user, users);
// Result type includes encrypted fields for email and address
```

## Identity-aware model operations

All model operations support lock contexts for identity-aware encryption:

```typescript
// Single model operations
const encryptedResult = await encryptionClient
  .encryptModel(user, users)
  .withLockContext(lockContext);

const decryptedResult = await encryptionClient
  .decryptModel(encryptedUser)
  .withLockContext(lockContext);

// Bulk operations
const bulkEncryptedResult = await encryptionClient
  .bulkEncryptModels(userModels, users)
  .withLockContext(lockContext);

const bulkDecryptedResult = await encryptionClient
  .bulkDecryptModels(encryptedUsers)
  .withLockContext(lockContext);
```

## Error handling

All model operations return a `Result` type that includes either a `data` or `failure` property:

```typescript
const result = await encryptionClient.encryptModel(user, users);

if (result.failure) {
  // Handle specific error types
  switch (result.failure.type) {
    case EncryptionErrorTypes.EncryptionError:
      console.error("Encryption failed:", result.failure.message);
      break;
    case EncryptionErrorTypes.ClientInitError:
      console.error("Client not initialized:", result.failure.message);
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
