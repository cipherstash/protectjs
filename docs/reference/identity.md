# Identity-aware encryption

CipherStash Encryption supports identity-aware encryption through the `LockContext` class.
Lock contexts tie encryption and decryption operations to an authenticated user identity, enabling row-level access control over encrypted data.

## Table of contents

- [Overview](#overview)
- [How it works](#how-it-works)
- [Setting up a LockContext](#setting-up-a-lockcontext)
  - [With a JWT token](#with-a-jwt-token)
  - [With an existing CTS token](#with-an-existing-cts-token)
- [Using lock contexts with operations](#using-lock-contexts-with-operations)
  - [Single value operations](#single-value-operations)
  - [Model operations](#model-operations)
  - [Bulk operations](#bulk-operations)
  - [Query operations](#query-operations)
- [Identity claims](#identity-claims)
- [Custom contexts](#custom-contexts)
- [Error handling](#error-handling)
- [Framework integrations](#framework-integrations)

## Overview

> [!IMPORTANT]
> Lock contexts require a **Business** or **Enterprise** [workspace plan](./plans.md#feature-availability).

Without a lock context, any client with valid credentials can decrypt any record.
With a lock context, decryption is restricted to the identity that encrypted the data — or to identities that match the configured identity claims.

This is useful for:

- Multi-tenant applications where each user's data must be isolated
- Compliance requirements that demand per-user encryption boundaries
- Applications where you need to prove that only authorized users accessed specific records

## How it works

1. Your application authenticates a user with your identity provider (e.g. Clerk, Auth0, Okta).
2. The user's JWT token is exchanged with the CipherStash Token Service (CTS) for a CTS token.
3. The CTS token is attached to encryption and decryption operations via `.withLockContext()`.
4. ZeroKMS enforces that only the matching identity can decrypt the data.

## Setting up a LockContext

Import `LockContext` from the `@cipherstash/stack/identity` subpath:

```typescript
import { LockContext } from '@cipherstash/stack/identity'
```

### With a JWT token

Exchange a user's JWT for a CTS token using the `identify` method:

```typescript
const lc = new LockContext()
const result = await lc.identify(userJwt)

if (result.failure) {
  console.error('Identity verification failed:', result.failure.message)
  return
}

const lockContext = result.data
```

The `identify` method:
1. Sends the JWT to the CipherStash Token Service (CTS).
2. Receives a CTS token containing the user's identity claims.
3. Returns the `LockContext` bound to that identity.

### With an existing CTS token

If you already have a CTS token (e.g. from middleware), pass it directly to the constructor:

```typescript
const lockContext = new LockContext({
  ctsToken: {
    accessToken: 'your-cts-access-token',
    expiry: 1700000000,
  },
})
```

This avoids a second round-trip to CTS when your middleware has already performed the token exchange.

## Using lock contexts with operations

All encrypt and decrypt operations support the `.withLockContext()` chain.

### Single value operations

```typescript
// Encrypt with lock context
const encryptResult = await client
  .encrypt('sensitive-value', {
    column: users.email,
    table: users,
  })
  .withLockContext(lockContext)

// Decrypt with lock context
const decryptResult = await client
  .decrypt(encryptedData)
  .withLockContext(lockContext)
```

### Model operations

```typescript
// Encrypt a model
const encryptedResult = await client
  .encryptModel(user, users)
  .withLockContext(lockContext)

// Decrypt a model
const decryptedResult = await client
  .decryptModel(encryptedUser)
  .withLockContext(lockContext)
```

### Bulk operations

```typescript
// Bulk encrypt
const bulkEncryptedResult = await client
  .bulkEncryptModels(userModels, users)
  .withLockContext(lockContext)

// Bulk decrypt
const bulkDecryptedResult = await client
  .bulkDecryptModels(encryptedUsers)
  .withLockContext(lockContext)
```

### Query operations

```typescript
const term = await client
  .encryptQuery('user@example.com', {
    column: users.email,
    table: users,
  })
  .withLockContext(lockContext)
```

## Identity claims

The `identityClaim` property determines which claims from the user's JWT are used to scope encryption.

| Identity claim | Description |
|----------------|-------------|
| `sub` | The user's subject identifier. This is the default. |
| `scopes` | The user's scopes set by your identity provider. |

By default, `LockContext` uses `['sub']`, which means encryption is scoped to the individual user.

## Custom contexts

You can customize which identity claims are used by passing a `context` option:

```typescript
const lockContext = new LockContext({
  context: {
    identityClaim: ['sub', 'scopes'],
  },
})
```

This is useful when you need encryption scoped to a combination of user identity and permissions.

## Error handling

The `identify` method returns a `Result` type:

```typescript
const result = await lc.identify(userJwt)

if (result.failure) {
  // result.failure.type is 'CtsTokenError'
  console.error('CTS token exchange failed:', result.failure.message)
}
```

Common failure scenarios:

| Scenario | Error type | Description |
|----------|-----------|-------------|
| Invalid JWT | `CtsTokenError` | The JWT token was rejected by CTS. |
| Network failure | `CtsTokenError` | Could not reach the CTS endpoint. |
| Missing workspace | Runtime error | `CS_WORKSPACE_CRN` is not configured. |
| Expired CTS token | `LockContextError` | The CTS token has expired. Call `identify` again. |

## Framework integrations

For framework-specific setup guides:

- [Lock contexts with Clerk and Next.js](../how-to/lock-contexts-with-clerk.md) — Uses `@cipherstash/nextjs` for automatic CTS token management in middleware.

---

### Didn't find what you wanted?

[Click here to let us know what was missing from our docs.](https://github.com/cipherstash/protectjs/issues/new?template=docs-feedback.yml&title=[Docs:]%20Feedback%20on%20identity.md)
