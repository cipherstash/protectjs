# Model Operations

Model operations in Protect.js provide a high-level interface for encrypting and decrypting entire objects. 
These operations automatically handle the encryption of fields defined in your schema while preserving other fields.

## Table of Contents

- [Basic Model Operations](#basic-model-operations)
  - [Encrypting a Model](#encrypting-a-model)
  - [Decrypting a Model](#decrypting-a-model)
- [Bulk Model Operations](#bulk-model-operations)
  - [Bulk Encryption](#bulk-encryption)
  - [Bulk Decryption](#bulk-decryption)
- [Type Safety](#type-safety)
  - [Using Type Parameters](#using-type-parameters)
  - [Type Inference from Schema](#type-inference-from-schema)
- [Identity-Aware Model Operations](#identity-aware-model-operations)
- [Error Handling](#error-handling)

## Basic Model Operations

### Encrypting a Model

The `encryptModel` method encrypts fields in your model that are defined in your schema while leaving other fields unchanged.

```typescript
import { protectClient } from "./protect";
import { users } from "./protect/schema";

const user = {
  id: "1",
  email: "user@example.com", // Will be encrypted (defined in schema)
  address: "123 Main St", // Will be encrypted (defined in schema)
  createdAt: new Date(), // Will remain unchanged
  metadata: { role: "admin" }, // Will remain unchanged
};

const encryptedResult = await protectClient.encryptModel(user, users);

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

### Decrypting a Model

The `decryptModel` method automatically detects and decrypts any encrypted fields in your model.

```typescript
const decryptedResult = await protectClient.decryptModel(encryptedUser);

if (decryptedResult.failure) {
  console.error("Decryption failed:", decryptedResult.failure.message);
  return;
}

const decryptedUser = decryptedResult.data;
// Result: Original model with decrypted values
```

## Bulk Model Operations

For better performance when working with multiple models, use these bulk encryption methods.

### Bulk Encryption

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

const encryptedResult = await protectClient.bulkEncryptModels(users, users);

if (encryptedResult.failure) {
  console.error("Bulk encryption failed:", encryptedResult.failure.message);
  return;
}

const encryptedUsers = encryptedResult.data;
```

### Bulk Decryption

```typescript
const decryptedResult = await protectClient.bulkDecryptModels(encryptedUsers);

if (decryptedResult.failure) {
  console.error("Bulk decryption failed:", decryptedResult.failure.message);
  return;
}

const decryptedUsers = decryptedResult.data;
```

## Type Safety

### Using Type Parameters

Protect.js provides strong TypeScript support through generic type parameters:

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
const encryptedResult = await protectClient.encryptModel<User>(user, users);
const decryptedResult = await protectClient.decryptModel<User>(encryptedUser);

// Bulk operations
const bulkEncryptedResult = await protectClient.bulkEncryptModels<User>(
  userModels,
  users
);
const bulkDecryptedResult =
  await protectClient.bulkDecryptModels<User>(encryptedUsers);
```

The type system ensures:

- Type safety for input models
- Correct handling of optional and nullable fields
- Preservation of nested object structures
- Type safety for encrypted and decrypted results

### Type Inference from Schema

The model operations can infer types from your schema definition:

```typescript
const users = csTable("users", {
  email: csColumn("email").freeTextSearch(),
  address: csColumn("address"),
});

// Types are inferred from the schema
const result = await protectClient.encryptModel(user, users);
// Result type includes encrypted fields for email and address
```

## Identity-Aware Model Operations

All model operations support lock contexts for identity-aware encryption:

```typescript
// Single model operations
const encryptedResult = await protectClient
  .encryptModel(user, users)
  .withLockContext(lockContext);

const decryptedResult = await protectClient
  .decryptModel(encryptedUser)
  .withLockContext(lockContext);

// Bulk operations
const bulkEncryptedResult = await protectClient
  .bulkEncryptModels(userModels, users)
  .withLockContext(lockContext);

const bulkDecryptedResult = await protectClient
  .bulkDecryptModels(encryptedUsers)
  .withLockContext(lockContext);
```

## Error Handling

All model operations return a `Result` type that includes either a `data` or `failure` property:

```typescript
const result = await protectClient.encryptModel(user, users);

if (result.failure) {
  // Handle specific error types
  switch (result.failure.type) {
    case ProtectErrorTypes.EncryptionError:
      console.error("Encryption failed:", result.failure.message);
      break;
    case ProtectErrorTypes.ClientInitError:
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
