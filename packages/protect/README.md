<h1 align="center">
  <img alt="CipherStash Logo" loading="lazy" width="128" height="128" decoding="async" data-nimg="1"   style="color:transparent" src="https://cipherstash.com/assets/cs-github.png">
  </br>
  Protect.js
</h1>
<p align="center">
  Implement robust data security without sacrificing performance or usability
  <br/>
  <div align="center" style="display: flex; justify-content: center; gap: 1rem;">
    <a href="https://cipherstash.com">
      <img
        src="https://raw.githubusercontent.com/cipherstash/meta/refs/heads/main/csbadge.svg"
        alt="Built by CipherStash"
      />
    </a>
    <a href="https://www.npmjs.com/package/@cipherstash/protect">
      <img
        alt="NPM version"
        src="https://img.shields.io/npm/v/@cipherstash/protect.svg?style=for-the-badge&labelColor=000000"
      />
    </a>
    <a href="https://github.com/cipherstash/protectjs/blob/main/LICENSE.md">
      <img
        alt="License"
        src="https://img.shields.io/npm/l/@cipherstash/protect.svg?style=for-the-badge&labelColor=000000"
      />
    </a>
  </div>
</p>
<br/>

<!-- start -->

Protect.js is a TypeScript package for encrypting and decrypting data.
Encryption operations happen directly in your app, and the ciphertext is stored in your database.

Every value you encrypt with Protect.js has a unique key, made possible by CipherStash [ZeroKMS](https://cipherstash.com/products/zerokms)'s blazing fast bulk key operations, and backed by a root key in [AWS KMS](https://docs.aws.amazon.com/kms/latest/developerguide/overview.html).

The encrypted data is structured as an [EQL](https://github.com/cipherstash/encrypt-query-language) JSON payload, and can be stored in any database that supports JSONB.

> [!IMPORTANT]
> Searching, sorting, and filtering on encrypted data is only supported in PostgreSQL at the moment.
> Read more about [searching encrypted data](./docs/concepts/searchable-encryption.md).

## Table of contents

- [Features](#features)
- [Installing Protect.js](#installing-protectjs)
- [Getting started](#getting-started)
- [Identity-aware encryption](#identity-aware-encryption)
- [Bulk encryption and decryption](#bulk-encryption-and-decryption)
- [Supported data types](#supported-data-types)
- [Searchable encryption](#searchable-encryption)
- [Logging](#logging)
- [CipherStash Client](#cipherstash-client)
- [Example applications](#example-applications)
- [Builds and bundling](#builds-and-bundling)
- [Contributing](#contributing)
- [License](#license)

For more specific documentation, refer to the [docs](https://github.com/cipherstash/protectjs/tree/main/docs).

## Features

Protect.js protects data in using industry-standard AES encryption.
Protect.js uses [ZeroKMS](https://cipherstash.com/products/zerokms) for bulk encryption and decryption operations.
This enables every encrypted value, in every column, in every row in your database to have a unique key — without sacrificing performance.

**Features:**
- **Bulk encryption and decryption**: Protect.js uses [ZeroKMS](https://cipherstash.com/products/zerokms) for encrypting and decrypting thousands of records at once, while using a unique key for every value.
- **Single item encryption and decryption**: Just looking for a way to encrypt and decrypt single values? Protect.js has you covered.
- **Really fast:** ZeroKMS's performance makes using millions of unique keys feasible and performant for real-world applications built with Protect.js.
- **Identity-aware encryption**: Lock down access to sensitive data by requiring a valid JWT to perform a decryption.
- **Audit trail**: Every decryption event will be logged in ZeroKMS to help you prove compliance.
- **Searchable encryption**: Protect.js supports searching encrypted data in PostgreSQL.
- **TypeScript support**: Strongly typed with TypeScript interfaces and types.

**Use cases:**
- **Trusted data access**: make sure only your end-users can access their sensitive data stored in your product.
- **Meet compliance requirements faster:** meet and exceed the data encryption requirements of SOC2 and ISO27001.
- **Reduce the blast radius of data breaches:** limit the impact of exploited vulnerabilities to only the data your end-users can decrypt.

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

### Opt-out of bundling

> [!IMPORTANT]
> **You need to opt-out of bundling when using Protect.js.**

Protect.js uses Node.js specific features and requires the use of the [native Node.js `require`](https://nodejs.org/api/modules.html#requireid).

When using Protect.js, you need to opt-out of bundling for tools like [Webpack](https://webpack.js.org/configuration/externals/), [esbuild](https://webpack.js.org/configuration/externals/), or [Next.js](https://nextjs.org/docs/app/api-reference/config/next-config-js/serverExternalPackages).

Read more about [building and bundling with Protect.js](#builds-and-bundling).

## Getting started

🆕 **Existing app?** Skip to [the next step](#configuration).

🌱 **Clean slate?** Check out the [getting started tutorial](./docs/getting-started.md).

### Configuration

> [!IMPORTANT]
> Make sure you have [installed the CipherStash CLI](#installing-protectjs) before following these steps.

To set up all the configuration and credentials required for Protect.js:

```bash
stash setup
```

If you haven't already signed up for a CipherStash account, this will prompt you to do so along the way.

At the end of `stash setup`, you will have two files in your project:

- `cipherstash.toml` which contains the configuration for Protect.js
- `cipherstash.secret.toml`: which contains the credentials for Protect.js

> [!WARNING]
> Don't commit `cipherstash.secret.toml` to git; it contains sensitive credentials.
> The `stash setup` command will attempt to append to your `.gitignore` file with the `cipherstash.secret.toml` file.

Read more about [configuration via TOML file or environment variables](./docs/reference/configuration.md).

### Basic file structure

The following is the basic file structure of the project.
In the `src/protect/` directory, we have the table definition in `schema.ts` and the protect client in `index.ts`.

```
📦 <project root>
 ├ 📂 src
 │   ├ 📂 protect
 │   │  ├ 📜 index.ts
 │   │  └ 📜 schema.ts
 │   └ 📜 index.ts
 ├ 📜 .env
 ├ 📜 cipherstash.toml
 ├ 📜 cipherstash.secret.toml
 ├ 📜 package.json
 └ 📜 tsconfig.json
```

### Define your schema

Protect.js uses a schema to define the tables and columns that you want to encrypt and decrypt.

Define your tables and columns by adding this to `src/protect/schema.ts`:

```ts
import { csTable, csColumn } from '@cipherstash/protect'

export const users = csTable('users', {
  email: csColumn('email'),
})

export const orders = csTable('orders', {
  address: csColumn('address'),
})
```

**Searchable encryption:**

If you want to search encrypted data in your PostgreSQL database, you must declare the indexes in schema in `src/protect/schema.ts`:

```ts
import { csTable, csColumn } from '@cipherstash/protect'

export const users = csTable('users', {
  email: csColumn('email').freeTextSearch().equality().orderAndRange(),
})

export const orders = csTable('orders', {
  address: csColumn('address'),
})
```

Read more about [defining your schema](./docs/reference/schema.md).

### Initialize the Protect client

To import the `protect` function and initialize a client with your defined schema, add the following to `src/protect/index.ts`:

```ts
import { protect } from '@cipherstash/protect'
import { users, orders } from './schema'

// Pass all your tables to the protect function to initialize the client
export const protectClient = await protect(users, orders)
```

The `protect` function requires at least one `csTable` be provided.

### Encrypt data

Protect.js provides the `encrypt` function on `protectClient` to encrypt data.
`encrypt` takes a plaintext string, and an object with the table and column as parameters.

To start encrypting data, add the following to `src/index.ts`:

```typescript
import { users } from './protect/schema'
import { protectClient } from './protect'

const encryptResult = await protectClient.encrypt(
  'secret@squirrel.example', {
    column: users.email,
    table: users,
  }
)

if (encryptResult.failure) {
  // Handle the failure
  console.log("error when encrypting:", encryptResult.failure.type, encryptResult.failure.message)
}

const ciphertext = encryptResult.data
console.log("ciphertext:", ciphertext)
```

The `encrypt` function will return a `Result` object with either a `data` key, or a `failure` key.
The `encryptResult` will return one of the following:

```typescript
// Success
{
  data: {
    c: 'mBbKmsMMkbKBSN}s1THy_NfQN892!dercyd0s...'
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

### Decrypt data

Protect.js provides the `decrypt` function on `protectClient` to decrypt data.
`decrypt` takes an encrypted data object as a parameter.

To start decrypting data, add the following to `src/index.ts`:

```typescript
import { protectClient } from './protect'

const decryptResult = await protectClient.decrypt(ciphertext)

if (decryptResult.failure) {
  // Handle the failure
  console.log("error when decrypting:", decryptResult.failure.type, decryptResult.failure.message)
}

const plaintext = decryptResult.data
console.log("plaintext:", plaintext)
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

### Store encrypted data in a database

Encrypted data can be stored in any database that supports JSONB, noting that searchable encryption is only supported in PostgreSQL at the moment.

To store the encrypted data, specify the column type as `jsonb`.

```sql
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email jsonb NOT NULL,
);
```

#### Searchable encryption in PostgreSQL

To enable searchable encryption in PostgreSQL, [install the EQL custom types and functions](https://github.com/cipherstash/encrypt-query-language?tab=readme-ov-file#installation).

1. Download the latest EQL install script:

   ```sh
   curl -sLo cipherstash-encrypt.sql https://github.com/cipherstash/encrypt-query-language/releases/latest/download/cipherstash-encrypt.sql
   ```

2. Run this command to install the custom types and functions:

   ```sh
   psql -f cipherstash-encrypt.sql
   ```

EQL is now installed in your database and you can enable searchable encryption by adding the `cs_encrypted_v1` type to a column.

```sql
CREATE TABLE users (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email cs_encrypted_v1
);
```

## Identity-aware encryption

> [!IMPORTANT]
> Right now identity-aware encryption is only supported if you are using [Clerk](https://clerk.com/) as your identity provider.
> Read more about [lock contexts with Clerk and Next.js](./docs/how-to/lock-contexts-with-clerk.md).

Protect.js can add an additional layer of protection to your data by requiring a valid JWT to perform a decryption.

This ensures that only the user who encrypted data is able to decrypt it.

Protect.js does this through a mechanism called a _lock context_.

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
import { protectClient } from './protect'
import { users } from './protect/schema'

const encryptResult = await protectClient.encrypt('plaintext', {
  table: users,
  column: users.email,
}).withLockContext(lockContext)

if (encryptResult.failure) {
  // Handle the failure
}

const ciphertext = encryptResult.data
```

### Decrypting data with a lock context

To decrypt data with a lock context, call the optional `withLockContext` method on the `decrypt` function and pass the lock context object as a parameter:

```typescript
import { protectClient } from './protect'

const decryptResult = await protectClient.decrypt(ciphertext).withLockContext(lockContext)

if (decryptResult.failure) {
  // Handle the failure
}

const plaintext = decryptResult.data
```

## Bulk encryption and decryption

If you have a large list of items to encrypt or decrypt, use the **`bulkEncrypt`** and **`bulkDecrypt`** methods to batch encryption/decryption.
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
//   { encryptedData: { c: 'ENCRYPTED_VALUE_1', k: 'ct' }, id: '1' },
//   { encryptedData: { c: 'ENCRYPTED_VALUE_2', k: 'ct' }, id: '2' },
// ]
```

Reassemble data by matching IDs:

```ts
encryptedValues.forEach((result) => {
  // Find the corresponding user
  const user = users.find((u) => u.id === result.id)
  if (user) {
    user.email = result.encryptedData  // Store the encrypted data back into the user object
  }
})
```

Learn more about [bulk encryption](./docs/reference/bulk-encryption-decryption.md#bulk-encrypting-data)

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

Learn more about [bulk decryption](./docs/reference/bulk-encryption-decryption.md#bulk-decrypting-data)

## Supported data types

Protect.js currently supports encrypting and decrypting text.
Other data types like booleans, dates, ints, floats, and JSON are well-supported in other CipherStash products, and will be coming to Protect.js soon.

Until support for other data types are available, you can express interest in this feature by adding a :+1: on this [GitHub Issue](https://github.com/cipherstash/protectjs/issues/48).

## Searchable encryption

Read more about [searching encrypted data](./docs/concepts/searchable-encryption.md) in the docs.

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

Read more about configuring the CipherStash Client in the [configuration docs](./docs/reference/configuration.md).

## Example applications

Looking for examples of how to use Protect.js?
Check out the [example applications](./apps):

- [Basic example](/apps/basic) demonstrates how to perform encryption operations
- [Drizzle example](/apps/drizzle) demonstrates how to use Protect.js with an ORM
- [Next.js and lock contexts example using Clerk](/apps/nextjs-clerk) demonstrates how to protect data with identity-aware encryption

`@cipherstash/protect` can be used with most ORMs.
If you're interested in using `@cipherstash/protect` with a specific ORM, please [create an issue](https://github.com/cipherstash/protectjs/issues/new).

## Builds and bundling

`@cipherstash/protect` is a native Node.js module, and relies on native Node.js `require` to load the package.

Here are a few resources to help based on your tool set:

- [Required Next.js configuration](./docs/how-to/nextjs-external-packages.md).
- [SST and AWS serverless functions](./docs/how-to/sst-external-packages.md).

## Contributing

Please read the [contribution guide](CONTRIBUTE.md).

## License

Protect.js is [MIT licensed](./LICENSE.md).
