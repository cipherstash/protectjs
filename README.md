# Protect.js

[![Tests](https://github.com/cipherstash/protectjs/actions/workflows/tests.yml/badge.svg)](https://github.com/cipherstash/protectjs/actions/workflows/tests.yml)
[![Built by CipherStash](https://raw.githubusercontent.com/cipherstash/meta/refs/heads/main/csbadge.svg)](https://cipherstash.com)

Protect.js is a JavaScript/TypeScript package for encrypting and decrypting data in PostgreSQL databases.
Encryption operations happen directly in your app, and the ciphertext is stored in your PostgreSQL database.

Every value you encrypt with Protect.js has a unique key, made possible by CipherStash [ZeroKMS](https://cipherstash.com/products/zerokms)'s blazing fast bulk key operations.
Under the hood Protect.js uses CipherStash [Encrypt Query Language (EQL)](https://github.com/cipherstash/encrypt-query-language), and all ZeroKMS data keys are backed by a root key in [AWS KMS](https://docs.aws.amazon.com/kms/latest/developerguide/overview.html).

## Table of contents

- [Features](#features)
- [Example applications](#example-applications)
- [Installing Protect.js](#installing-protectjs)
- [Getting started](#getting-started)
- [Identity-aware encryption](#identity-aware-decryption)
- [Bulk encryption and decryption](#bulk-encryption-and-decryption)
- [Supported data types](#supported-data-types)
- [Searchable encryption](#searchable-encryption)
- [Logging](#logging)
- [CipherStash Client](#cipherstash-client)
- [Builds and bundling](#builds-and-bundling)
- [Contributing](#contributing)
- [License](#license)

For more specific documentation, please refer to the [docs](https://github.com/cipherstash/protectjs/tree/main/docs).

## Features

Protect.js protects data in PostgreSQL databases using industry-standard AES encryption.
Protect.js uses [ZeroKMS](https://cipherstash.com/products/zerokms) for bulk encryption and decryption operations.
This enables every encrypted value, in every column, in every row in your database to have a unique key — without sacrificing performance.

**Features:**
- **Bulk encryption and decryption**: Protect.js uses [ZeroKMS](https://cipherstash.com/products/zerokms) for encrypting and decrypting thousands of records at once, while using a unique key for every value.
- **Single item encryption and decryption**: Just looking for a way to encrypt and decrypt single values? Protect.js has you covered.
- **Really fast:** ZeroKMS's performance makes using millions of unique keys feasible and performant for real-world applications built with Protect.js.
- **Identity-aware encryption**: Lock down access to sensitive data by requiring a valid JWT to perform a decryption.
- **TypeScript support**: Strongly typed with TypeScript interfaces and types.

**Use cases:**
- **Trusted data access**: make sure only your end-users can access their sensitive data stored in your product.
- **Meet compliance requirements faster:** achieve and exceed the data encryption requirements of SOC2 and ISO27001.
- **Reduce the blast radius of data breaches:** limit the impact of exploited vulnerabilities to only the data your end-users can decrypt.

## Example applications

New to Protect.js?
Check out the example applications:

- [Basic example](/apps/basic) demonstrates how to perform encryption operations
- [Drizzle example](/apps/drizzle) demonstrates how to use Protect.js with an ORM
- [Next.js and lock contexts example using Clerk](/apps/nextjs-clerk) demonstrates how to protect data with identity-aware encryption

`@cipherstash/protect` can be used with most ORMs that support PostgreSQL.
If you're interested in using `@cipherstash/protect` with a specific ORM, please [create an issue](https://github.com/cipherstash/protectjs/issues/new).

## Installing Protect.js

Install the [`@cipherstash/protect` package](https://www.npmjs.com/package/@cipherstash/protect) with your package manager of choice:

```bash
npm install @cipherstash/protect
# or
yarn add @cipherstash/protect
# or
pnpm add @cipherstash/protect
```

> [!TIP]
> [Bun](https://bun.sh/) is not currently supported due to a lack of [Node-API compatibility](https://github.com/oven-sh/bun/issues/158). Under the hood, Protect.js uses [CipherStash Client](#cipherstash-client) which is written in Rust and embedded using [Neon](https://github.com/neon-bindings/neon).

Lastly, install the CipherStash CLI:

- On macOS:

  ```bash
  brew install cipherstash/tap/stash
  ```

- On Linux, download the binary for your platform, and put it on your `PATH`:
    - [Linux ARM64](https://github.com/cipherstash/cli-releases/releases/latest/download/stash-aarch64-unknown-linux-gnu)
    - [Linux x86_64](https://github.com/cipherstash/cli-releases/releases/latest/download/stash-x86_64-unknown-linux-gnu)


## Getting started

### Configuration

> [!IMPORTANT]
> Make sure you have [installed the CipherStash CLI](#installation) before following these steps.

To set up all the configuration and credentials required for Protect.js:

```bash
stash setup
```

If you have not already signed up for a CipherStash account, this will prompt you to do so along the way.

At the end of `stash setup`, you will have two files in your project:

- `cipherstash.toml` which contains the configuration for Protect.js
- `cipherstash.secret.toml`: which contains the credentials for Protect.js

> [!WARNING]
> `cipherstash.secret.toml` should not be committed to git, because it contains sensitive credentials.
> The `stash setup` command will attempt to append to your `.gitignore` file with the `cipherstash.secret.toml` file.

You can read more about [configuration via toml file or environment variables here](./docs/configuration.md).

### Initializing the Protect client

In your application, import the `protect` function from the `@cipherstash/protect` package, and initialize a client with your CipherStash credentials.

```typescript
const { protect } = require('@cipherstash/protect')
const protectClient = await protect()
```

If you are using ES6:

```typescript
import { protect } from '@cipherstash/protect'
const protectClient = await protect()
```

### Encrypting data

Use the `encrypt` function to encrypt data.
`encrypt` takes a plaintext string, and an object with the table and column name as parameters.

```typescript
const encryptResult = await protectClient.encrypt('secret@squirrel.example', {
  column: 'email',
  table: 'users',
})

if (encryptResult.failure) {
  // Handle the failure
}

const ciphertext = encryptResult.data
```

The `encrypt` function will return a `Result` object with either a `data` key, or a `failure` key.
The `encryptResult` will return one of the following:

```typescript
// Success
{
  data: {
    c: '\\\\\\\\\\\\\\\\x61202020202020472aaf602219d48c4a...'
  }
}

// Failure
{
  failure: {
    type: 'EncryptionError',
    message: 'A message about the error'
  }
}
```

> [!TIP]
> Get significantly better encryption performance by using the [`bulkEncrypt` function](#bulk-encrypting-data) for large payloads.

### Decrypting data

Use the `decrypt` function to decrypt data.
`decrypt` takes an encrypted data object, and an object with the lock context as parameters.

```typescript
const decryptResult = await protectClient.decrypt(ciphertext)

if (decryptResult.failure) {
  // Handle the failure
}

const plaintext = decryptResult.data
```

The `decrypt` function returns a `Result` object with either a `data` key, or a `failure` key.
The `decryptResult` will return one of the following:

```typescript
// Success
{
  data: 'secret@squirrel.example'
}

// Failure
{
  failure: {
    type: 'DecryptionError',
    message: 'A message about the error'
  }
}
```

> [!TIP]
> Get significantly better decryption performance by using the [`bulkDecrypt` function](#bulk-decrypting-data) for large payloads.

### Storing encrypted data in a database

To store the encrypted data in PostgreSQL, you will need to specify the column type as `jsonb`.

```sql
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email jsonb NOT NULL,
);
```

## Context Locking

Protect.js can refine data protection controls by requiring that specific conditions be met before decryption is allowed.
This allows for the development of quite sophisticated (and verifiable) access controls with minimal code.

### How it works

When a value is encrypted using Protect.js, one or more context values can be specified.
When decrypted, the _identical_ context values must be included or decryption will fail.

To better explain this, we'll use an example.
Consider a `Customer` record (defined using [Drizzle](https://orm.drizzle.team/)).

```typescript
import { sql } from "drizzle-orm";
import { jsonb, pgTable, uuid } from "drizzle-orm/pg-core";

const table = pgTable('table', {
	id: uuid().defaultRandom(),
  name: jsonb(),
  email: jsonb()
});
```

We'll store in a `customers` table in the database.
The `name` and `email` fields will be encrypted so we'll use the JSONB type.

```sql
CREATE TABLE customers (
  uuid PRIMARY KEY,
  name jsonb,
  email jsonb
);
```

Note that the ID type is a `UUID` (Universally Unique ID) instead of a simple integer.
This is so that we can specify the ID in the client rather than having the database generate one for us.
We'll see why that's helpful in a moment.

To encrypt a record, we'll use the same approach as above but with 2 important differences:

1. We'll generate the ID ahead of time
1. We'll include that ID in the _lock context_ of the encrypted value




## Identity-aware encryption

Protect.js can add an additional layer of data protection by requiring that specific conditions be met before decryption is allowed.

A powerful example of this is a condition that limits decryption only to the specific user that encrypted.
In this way, you can enforce record ownership with only a few lines of code.

Protect.js does this through a mechanism called _lock context_ which cryptographically encodes decryption conditions when data is encrypted.

> [!TIP]
Lock context is a way to encode access policies directly into data in a way that prevents tampering and can be easily verified.

### Role or attribute based encryption

TODO: Explain how the Lock context can be used for RBAC or ABAC.
Link to the glossary.

Identity locks can be used to implement [Role](https://cipherstash.com/docs/glossary#rbac-role-based-access-control) or [Attribute](https://cipherstash.com/docs/glossary#abac-attribute-based-access-control) based access control (RBAC/ABAC) for the decryption of data.

For example, 

### Specifying an identity provider

To include attributes from a user's (or system's) identity in the lock context you must first specify which identity provider your users authenticate with.

CipherStash supports identity claims using [Open ID Connect](https://cipherstash.com/docs/glossary#oidc-open-id-connect) (OIDC) from:

* [Auth0](https://auth0.com/docs/secure/tokens)
* [Okta](https://developer.okta.com/docs/api/openapi/okta-oauth/guides/overview/#id-token)
* [Clerk](https://clerk.com/docs/backend-requests/resources/session-tokens)

To add a provider, use the `oidc` subcommand of the `stash` CLI tool.
You need to specify the `issuer` URL and the vendor identifier
along with a workspace ID.

For example, to add an Auth0 provider at the domain `example-dev.au.auth0.com`:

```bash
stash oidc provider add \
  --vendor auth0 \
  --issuer https://example-dev.au.auth0.com
  --workspace-id C1U7RN47AJNSMABB
```

| Argument     | Description                                   | Allowed Values             |
|--------------|-----------------------------------------------|----------------------------|
| Vendor       | The Identity Provider                         | `auth0`, `okta` or `clerk` |
| Issuer       | The service issuing JWTs                      | URL including `https://`   |
| Workspace ID | The workspace to add the identity provider to | A workspace you own        |

> [!TIP]
> If you're not sure what to use for the `issuer` value, you can paste a JWT into [jwt.io](https://jwt.io).
> Though make sure not to paste a JWT just anywhere!

For more information on how to manage OIDC providers run `stash --help` or refer to the [Stash CLI reference docs](https://cipherstash.com/docs/sdk/reference/cli).


### Lock context

Lock contexts ensure that only specific users can access sensitive data.

> [!CAUTION]
> You must use the same lock context to encrypt and decrypt data.
> If you use different lock contexts, you will be unable to decrypt the data.

To use a lock context, initialize a `LockContext` object with the identity claims.

```typescript
import { LockContext } from '@cipherstash/protect/identify'

// protectClient from the previous steps
const lc = new LockContext()
```

> [!NOTE]
> When initializing a `LockContext`, the default context is set to use the `sub` Identity Claim.

### Identifying a user for a lock context

A lock context needs to be locked to a user.
To identify the user, call the `identify` method on the lock context object, and pass a valid JWT from a user's session:

```typescript
const identifyResult = await lc.identify(jwt)

// The identify method returns the same Result pattern as the encrypt and decrypt methods. 
if (identifyResult.failure) {
  // Hanlde the failure
}

const lockContext = identifyResult.data
```

### Encrypting data with a lock context

To encrypt data with a lock context, call the optional `withLockContext` method on the `encrypt` function and pass the lock context object as a parameter:

```typescript
const encryptResult = await protectClient.encrypt('plaintext', {
  table: 'users',
  column: 'email',
}).withLockContext(lockContext)

if (encryptResult.failure) {
  // Handle the failure
}

const ciphertext = encryptResult.data
```

### Decrypting data with a lock context

To decrypt data with a lock context, call the optional `withLockContext` method on the `decrypt` function and pass the lock context object as a parameter:

```typescript
const decryptResult = await protectClient.decrypt(ciphertext).withLockContext(lockContext)

if (decryptResult.failure) {
  // Handle the failure
}

const plaintext = decryptResult.data
```

## Bulk encryption and decryption

If you have a large list of items to encrypt or decrypt, you can use the **`bulkEncrypt`** and **`bulkDecrypt`** methods to batch encryption/decryption.
`bulkEncrypt` and `bulkDecrypt` give your app significantly better throughput than the single-item [`encrypt`](#encrypting-data) and [`decrypt`](#decrypting-data) methods.


### Bulk encrypting data

Build a list of records to encrypt:

```ts
const users = [
  { id: '1', name: 'CJ', email: 'cj@example.com' },
  { id: '2', name: 'Alex', email: 'alex@example.com' },
]
```

Prepare the array for bulk encryption:

```ts
const plaintextsToEncrypt = users.map((user) => ({
  plaintext: user.email, // The data to encrypt
  id: user.id,           // Keep track by user ID
}))
```

Perform the bulk encryption:

```ts
const encryptedResults = await bulkEncrypt(plaintextsToEncrypt, {
  column: 'email',
  table: 'Users',
})

if (encryptedResults.failure) {
  // Handle the failure
}

const encryptedValues = encryptedResults.data

// encryptedValues might look like:
// [
//   { c: 'ENCRYPTED_VALUE_1', id: '1' },
//   { c: 'ENCRYPTED_VALUE_2', id: '2' },
// ]
```

Reassemble data by matching IDs:

```ts
encryptedValues.forEach((result) => {
  // Find the corresponding user
  const user = users.find((u) => u.id === result.id)
  if (user) {
    user.email = result.c  // Store ciphertext back into the user object
  }
})
```

Learn more about [bulk encryption](./docs/bulk-encryption-decryption.md#bulk-encrypting-data)

### Bulk decrypting data

Build an array of records to decrypt:

```ts
const users = [
  { id: '1', name: 'CJ', email: 'ENCRYPTED_VALUE_1' },
  { id: '2', name: 'Alex', email: 'ENCRYPTED_VALUE_2' },
]
```

Prepare the array for bulk decryption:

```ts
const encryptedPayloads = users.map((user) => ({
  c: user.email,
  id: user.id,
}))
```

Perform the bulk decryption:

```ts
const decryptedResults = await bulkDecrypt(encryptedPayloads)

if (decryptedResults.failure) {
  // Handle the failure
}

const decryptedValues = decryptedResults.data

// decryptedValues might look like:
// [
//   { plaintext: 'cj@example.com', id: '1' },
//   { plaintext: 'alex@example.com', id: '2' },
// ]
```

Reassemble data by matching IDs:

```ts
decryptedValues.forEach((result) => {
  const user = users.find((u) => u.id === result.id)
  if (user) {
    user.email = result.plaintext  // Put the decrypted value back in place
  }
})
```

Learn more about [bulk decryption](./docs/bulk-encryption-decryption.md#bulk-decrypting-data)

## Supported data types

`@cipherstash/protect` currently supports encrypting and decrypting text.
Other data types like booleans, dates, ints, floats, and JSON are extremely well supported in other CipherStash products, and will be coming to `@cipherstash/protect`.
Until support for other data types are available in `@cipherstash/protect`, you can:

- Read [about how these data types work in EQL](https://github.com/cipherstash/encrypt-query-language/blob/main/docs/reference/INDEX.md)
- Express interest in this feature by adding a :+1: on this [GitHub Issue](https://github.com/cipherstash/protectjs/issues/48).

## Searchable encryption

`@cipherstash/protect` does not currently support searching encrypted data.
Searchable encryption is an extremely well supported capability in other CipherStash products, and will be coming to `@cipherstash/protect`.
Until searchable encryption support is released in `@cipherstash/protect`, you can:

- Read [about how searchable encryption works in EQL](https://github.com/cipherstash/encrypt-query-language)
- Express interest in this feature by adding a :+1: on this [GitHub Issue](https://github.com/cipherstash/protectjs/issues/46).

## Logging

> [!IMPORTANT]
> `@cipherstash/protect` will NEVER log plaintext data.
> This is by design to prevent sensitive data from leaking into logs.

`@cipherstash/protect` and `@cipherstash/nextjs` will log to the console with a log level of `info` by default.
To enable the logger, configure the following environment variable:

```bash
PROTECT_LOG_LEVEL=debug  # Enable debug logging
PROTECT_LOG_LEVEL=info   # Enable info logging
PROTECT_LOG_LEVEL=error  # Enable error logging
```

## CipherStash Client

Protect.js is built on top of the CipherStash Client Rust SDK which is embedded with the `@cipherstash/protect-ffi` package.
The `@cipherstash/protect-ffi` source code is available on [GitHub](https://github.com/cipherstash/protectjs-ffi).

Read more about configuring the CipherStash client in the [configuration docs](./docs/configuration.md).

## Builds and bundling

`@cipherstash/protect` is a native Node.js module, and relies on native Node.js `require` to load the package.

Here are a few resources to help based on your tool set:

- [Required Next.js configuration](./docs/nextjs.md).
- [SST and AWS serverless functions](./docs/sst.md).

## Contributing

Please read the [contribution guide](CONTRIBUTE.md).

## License

Protect.js is [MIT licensed](./LICENSE.md).
