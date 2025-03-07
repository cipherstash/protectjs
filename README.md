<h1 align="center">
  <img alt="CipherStash Logo" loading="lazy" width="200" height="60" decoding="async" data-nimg="1"   style="color:transparent" src="https://cipherstash.com/assets/cs-github.png">
  </br>

  Protect.js</h1>
<p align="center">
  Implement robust data security without sacrificing performance or usability
  <br/>
  <a href="https://cipherstash.com">Built by CipherStash</a>
</p>
<br/>

<!-- start -->

## What's Protect.js?

Protect.js is a TypeScript package for encrypting and decrypting data.
Encryption operations happen directly in your app, and the ciphertext is stored in your database.

Every value you encrypt with Protect.js has a unique key, made possible by CipherStash [ZeroKMS](https://cipherstash.com/products/zerokms)'s blazing fast bulk key operations, and backed by a root key in [AWS KMS](https://docs.aws.amazon.com/kms/latest/developerguide/overview.html).

The encrypted data is structured as an [EQL](https://github.com/cipherstash/encrypt-query-language) JSON payload, and can be stored in any database that supports JSONB.

> [!IMPORTANT]
> Searching, sorting, and filtering on encrypted data is only supported in PostgreSQL at the moment.
> Read more about [searching encrypted data](./docs/concepts/searchable-encryption.md).

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
- **Meet compliance requirements faster:** achieve and exceed the data encryption requirements of SOC2 and ISO27001.
- **Reduce the blast radius of data breaches:** limit the impact of exploited vulnerabilities to only the data your end-users can decrypt.

## Example applications

New to Protect.js?
Check out the example applications:

- [Basic example](/apps/basic) demonstrates how to perform encryption operations
- [Drizzle example](/apps/drizzle) demonstrates how to use Protect.js with an ORM
- [Next.js and lock contexts example using Clerk](/apps/nextjs-clerk) demonstrates how to protect data with identity-aware encryption

`@cipherstash/protect` can be used with most ORMs.
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
 
### Opt-out of bundling

Protect.js uses Node.js specific features and requires the use of the native Node.js `require`.
You need to opt-out of bundling for tools like [Webpack](https://webpack.js.org/configuration/externals/), [esbuild](https://webpack.js.org/configuration/externals/), or [Next.js](https://nextjs.org/docs/app/api-reference/config/next-config-js/serverExternalPackages). 

Read more about bundling [here](#builds-and-bundling).

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

You can read more about [configuration via toml file or environment variables here](./docs/reference/configuration.md).

### Basic file structure

This is the basic file structure of the project. In the `src/protect` directory, we have table definition in `schema.ts` and the protect client in `index.ts`.

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

### Defining your schema

Protect.js uses a schema to define the tables and columns that you want to encrypt and decrypt.

In the `src/protect/schema.ts` file, you can define your tables and columns.

```ts
import { csTable, csColumn } from '@cipherstash/protect'

export const users = csTable('users', {
  email: csColumn('email'),
})

export const orders = csTable('orders', {
  address: csColumn('address'),
})
```

**Searchable encryption**

If you are looking to enable searchable encryption in a PostgreSQL database, you must declaratively enable the indexes in your schema.

```ts
import { csTable, csColumn } from '@cipherstash/protect'

export const users = csTable('users', {
  email: csColumn('email').freeTextSearch().equality().orderAndRange(),
})
```

Read more about [defining your schema here](./docs/reference/schema.md).

### Initializing the Protect client

To initialize the protect client, import the `protect` function and initialize a client with your defined schema.

In the `src/protect/index.ts` file:

```ts
import { protect } from '@cipherstash/protect'
import { users } from './schema'

// Pass all your tables to the protect function to initialize the client
export const protectClient = await protect(users, orders)
```

The `protect` function requires at least one `csTable` to be passed in.

### Encrypting data

Use the `encrypt` function to encrypt data.
`encrypt` takes a plaintext string, and an object with the table and column as parameters.

```typescript
import { users } from './protect/schema'
import { protectClient } from './protect'

const encryptResult = await protectClient.encrypt('secret@squirrel.example', {
  column: users.email,
  table: users,
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
`decrypt` takes an encrypted data object as a parameter.

```typescript
import { protectClient } from './protect'

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

Encrypted data can be stored in any database that supports JSONB, noting that searchable encryption is only supported in PostgreSQL at the moment.

To store the encrypted data, you will need to specify the column type as `jsonb`.

```sql
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email jsonb NOT NULL,
);
```

#### Searchable encryption in PostgreSQL

To enable searchable encryption in PostgreSQL, you need to [install the EQL custom types and functions](https://github.com/cipherstash/encrypt-query-language?tab=readme-ov-file#installation).

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
Other data types like booleans, dates, ints, floats, and JSON are well supported in other CipherStash products, and will be coming to Protect.js soon.

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

Read more about configuring the CipherStash client in the [configuration docs](./docs/reference/configuration.md).

## Builds and bundling

`@cipherstash/protect` is a native Node.js module, and relies on native Node.js `require` to load the package.

Here are a few resources to help based on your tool set:

- [Required Next.js configuration](./docs/how-to/nextjs-external-packages.md).
- [SST and AWS serverless functions](./docs/how-to/sst-external-packages.md).

## Contributing

Please read the [contribution guide](CONTRIBUTE.md).

## License

Protect.js is [MIT licensed](./LICENSE.md).
