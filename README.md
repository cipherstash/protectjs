# Protect.js

[![Tests](https://github.com/cipherstash/protectjs/actions/workflows/tests.yml/badge.svg)](https://github.com/cipherstash/protectjs/actions/workflows/tests.yml)
[![Built by CipherStash](https://raw.githubusercontent.com/cipherstash/meta/refs/heads/main/csbadge.svg)](https://cipherstash.com)

Protect.js is a JavaScript/TypeScript package for encrypting and decrypting data in PostgreSQL databases.
Encryption operations happen directly in your app, and the ciphertext is stored in your PostgreSQL database.

Every value you encrypt with Protect.js has a unique key, made possible by CipherStash [ZeroKMS](https://cipherstash.com/products/zerokms)'s blazing fast bulk key operations.
Under the hood Protect.js uses CipherStash [Encrypt Query Language (EQL)](https://github.com/cipherstash/encrypt-query-language), and all ZeroKMS data keys are backed by a root key in [AWS KMS](https://docs.aws.amazon.com/kms/latest/developerguide/overview.html).

## Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Platform Support](#platform-support)
- [Usage](#usage)
- [Logging](#logging)
- [Examples](#examples)
- [CipherStash Client](#cipherstash-client)
- [Contributing](#contributing)
- [License](#license)

## Features

Protect.js protects data in PostgreSQL databases using industry standard AES encryption.
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

## Installation

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


## Usage

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


### Initialize the EQL client

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
const ciphertext = await protectClient.encrypt('secret@squirrel.example', {
  column: 'email',
  table: 'users',
})
```

The `encrypt` function returns an object with a `c` key, and the value is the encrypted data.

```typescript
{
  c: '\\\\\\\\\\\\\\\\x61202020202020472aaf602219d48c4a...'
}
```

> [!TIP]
> You can get significantly better encryption performance by using the [`bulkEncrypt` function](#bulk-encrypting-data).

### Decrypting data

Use the `decrypt` function to decrypt data.
`decrypt` takes an encrypted data object, and an object with the lock context as parameters.

```typescript
const plaintext = await protectClient.decrypt(ciphertext)
```

The `decrypt` function returns a string containing the plaintext data.

```typescript
'secret@squirrel.example'
```

> [!TIP]
> You can get significantly better decryption performance by using the [`bulkDecrypt` function](#bulk-decrypting-data).

## Identity-aware encryption

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

### Identify a user for a lock context

A lock context needs to be locked to a user.
To identify the user, call the `identify` method on the lock context object, and pass a valid JWT from a user's session:

```typescript
const lockContext = await lc.identify(jwt)
```

### Encrypting data with a lock context

To encrypt data with a lock context, call the optional `withLockContext` method on the `encrypt` function and pass the lock context object as a parameter:

```typescript
const ciphertext = await protectClient.encrypt('plaintext', {
  table: 'users',
  column: 'email',
}).withLockContext(lockContext)
```

### Decrypting data with a lock context

To decrypt data with a lock context, call the optional `withLockContext` method on the `decrypt` function and pass the lock context object as a parameter:

```typescript
const plaintext = await protectClient.decrypt(ciphertext).withLockContext(lockContext)
```

### Storing encrypted data in a database

To store the encrypted data in PostgreSQL, you will need to specify the column type as `jsonb`.

```sql
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  encrypted_data jsonb NOT NULL
);
```

### Bulk Encryption/Decryption

If you have a large list of items to encrypt or decrypt, you can use the **`bulkEncrypt`** and **`bulkDecrypt`** methods to batch encryption/decryption.
`bulkEncrypt` and `bulkDecrypt` give your app significantly better throughput than the single-item `encrypt` / `decrypt` methods.

#### bulkEncrypt

```ts
const encryptedResults = await protectClient.bulkEncrypt(plaintextsToEncrypt, {
  column: 'email',
  table: 'Users',
})

// or with lock context

const encryptedResults = await protectClient.bulkEncrypt(plaintextsToEncrypt, {
  column: 'email',
  table: 'Users',
}).withLockContext(lockContext)
```

**Parameters**

1. **`plaintexts`**
   - **Type**: `{ plaintext: string; id: string }[]`
   - **Description**:
     An array of objects containing the **plaintext** and an **id**.
     - **plaintext**: The string you want encrypted.
     - **id**: A unique identifier you can use to map the returned ciphertext back to its source. For example, if you have a `User` with `id: 1`, you might pass `id: '1'`.

2. **`column`**
   - **Type**: `string`
   - **Description**:
     The name of the column you’re encrypting (e.g., "email"). This is typically used in logging or contextual purposes when constructing the payload for the encryption engine.

3. **`table`**
   - **Type**: `string`
   - **Description**:
     The name of the table you’re encrypting data in (e.g., "Users").

### Return Value

- **Type**: `Promise<Array<{ c: string; id: string }> | null>`
- Returns an array of objects, where:
  - **`c`** is the ciphertext.
  - **`id`** is the same **id** you passed in, so you can correlate which ciphertext matches which original plaintext.
- If `plaintexts` is an empty array, it returns `null`.

### Example Usage

```ts
// 1) Gather your data. For example, a list of users with plaintext fields.
const users = [
  { id: '1', name: 'CJ', email: 'cj@example.com' },
  { id: '2', name: 'Alex', email: 'alex@example.com' },
]

// 2) Prepare the array for bulk encryption (only encrypting the "email" field here).
const plaintextsToEncrypt = users.map((user) => ({
  plaintext: user.email, // The data to encrypt
  id: user.id,           // Keep track by user ID
}))

// 3) Call bulkEncrypt
const encryptedResults = await bulkEncrypt(plaintextsToEncrypt, {
  column: 'email',
  table: 'Users',
})

// encryptedResults might look like:
// [
//   { c: 'ENCRYPTED_VALUE_1', id: '1' },
//   { c: 'ENCRYPTED_VALUE_2', id: '2' },
// ]

// 4) Reassemble data by matching IDs
if (encryptedResults) {
  encryptedResults.forEach((result) => {
    // Find the corresponding user
    const user = users.find((u) => u.id === result.id)
    if (user) {
      user.email = result.c  // Store ciphertext back into the user object
    }
  })
}
```

#### bulkDecrypt

```ts
const decryptedResults = await protectClient.bulkDecrypt(encryptedPayloads)

// or with lock context

const decryptedResults = await protectClient.bulkDecrypt(encryptedPayloads).withLockContext(lockContext)
```

**Parameters**

1. **`encryptedPayloads`**
   - **Type**: `Array<{ c: string; id: string }> | null`
   - **Description**:
     An array of objects containing the **ciphertext** (`c`) and the **id**. If this array is empty or `null`, the function returns `null`.

### Return Value

- **Type**: `Promise<Array<{ plaintext: string; id: string }> | null>`
- Returns an array of objects, where:
  - **`plaintext`** is the decrypted value.
  - **`id`** is the same **id** you passed in, so you can correlate which plaintext matches which original ciphertext.
- Returns `null` if the provided `encryptedPayloads` is empty or `null`.

### Example Usage

```ts
// Suppose you've retrieved an array of users where their email fields are ciphertext:
const users = [
  { id: '1', name: 'CJ', email: 'ENCRYPTED_VALUE_1' },
  { id: '2', name: 'Alex', email: 'ENCRYPTED_VALUE_2' },
]

// 1) Prepare the array for bulk decryption
const encryptedPayloads = users.map((user) => ({
  c: user.email,
  id: user.id,
}))

// 2) Call bulkDecrypt
const decryptedResults = await bulkDecrypt(encryptedPayloads)

// decryptedResults might look like:
// [
//   { plaintext: 'cj@example.com', id: '1' },
//   { plaintext: 'alex@example.com', id: '2' },
// ]

// 3) Reassemble data by matching IDs
if (decryptedResults) {
  decryptedResults.forEach((result) => {
    const user = users.find((u) => u.id === result.id)
    if (user) {
      user.email = result.plaintext  // Put the decrypted value back in place
    }
  })
}
```

## Supported data types

`@cipherstash/protect` currently supports encrypting and decrypting text.
Other data types like booleans, dates, ints, floats, and JSON are extremely well supported in other CipherStash products, and will be coming to `@cipherstash/protect`.
Until support for other data types are available in `@cipherstash/protect`, you can:

- Read [about how these data types work in EQL](https://github.com/cipherstash/encrypt-query-language/blob/main/docs/reference/INDEX.md)
- Vote for this feature by adding a :+1: on this [GitHub Issue](https://github.com/cipherstash/protectjs/issues/48).

## Searchable encryption

`@cipherstash/protect` does not currently support searching encrypted data.
Searchable encryption is an extremely well supported capability in other CipherStash products, and will be coming to `@cipherstash/protect`.
Until searchable encryption support is released in `@cipherstash/protect`, you can:

- Read [about how searchable encryption works in EQL](https://github.com/cipherstash/encrypt-query-language)
- Vote for this feature by adding a :+1: on this [GitHub Issue](https://github.com/cipherstash/protectjs/issues/46).

## Logging

> [!IMPORTANT]
> `@cipherstash/protect` will NEVER log plaintext data.
> This is by design to prevent sensitive data from leaking into logs.

`@cipherstash/protect` and `@cipherstash/nextjs` will log to the console with a log level of `info` by default.
You can enable the logger by configuring the following environment variable:

```bash
PROTECT_LOG_LEVEL=debug  # Enable debug logging
PROTECT_LOG_LEVEL=info   # Enable info logging
PROTECT_LOG_LEVEL=error  # Enable error logging
```

## Builds and bundling

`@cipherstash/protect` is a native Node.js module, and relies on native Node.js `require` to load the package.

### Next.js

Using `@cipherstash/protect` with Next.js? You need to opt-out from the Server Components bundling and use native Node.js `require` instead.

#### Using version 15 or later

`next.config.ts` [configuration](https://nextjs.org/docs/app/api-reference/config/next-config-js/serverExternalPackages):

```js
const nextConfig = {
  ...
  serverExternalPackages: ['@cipherstash/protect'],
}
```

#### Using version 14

`next.config.mjs` [configuration](https://nextjs.org/docs/14/app/api-reference/next-config-js/serverComponentsExternalPackages):

```js
const nextConfig = {
  ...
  experimental: {
    serverComponentsExternalPackages: ['@cipherstash/protect'],
  },
}
```

## Examples

- [Basic example](/apps/basic)
- [Drizzle example](/apps/drizzle)
- [Next.js and Lock Contexts example using Clerk](/apps/nextjs-clerk)

`@cipherstash/protect` can be used with most ORMs that support PostgreSQL.
If you're interested in using `@cipherstash/protect` with a specific ORM, please [create an issue](https://github.com/cipherstash/protectjs/issues/new).

## CipherStash Client

Protect.js is built on top of the CipherStash Client Rust SDK which is integrated with the `@cipherstash/protect-ffi` package.
The `@cipherstash/protect-ffi` source code is available on [GitHub](https://github.com/cipherstash/protectjs-ffi).

The Cipherstash Client is configured by environment variables, which are used to initialize the client when the `protect` function is called:

|      Variable Name     |                           Description                           | Required |                    Default                   |
|:----------------------:|:---------------------------------------------------------------:|:--------:|:--------------------------------------------:|
| `CS_CLIENT_ID`         | The client ID for your CipherStash account.                     | Yes      |                                              |
| `CS_CLIENT_KEY`        | The client key for your CipherStash account.                    | Yes      |                                              |
| `CS_WORKSPACE_ID`      | The workspace ID for your CipherStash account.                  | Yes      |                                              |
| `CS_CLIENT_ACCESS_KEY` | The access key for your CipherStash account.                    | Yes      |                                              |
| `CS_ZEROKMS_HOST`      | The host for the ZeroKMS server.                                | No       | `https://ap-southeast-2.aws.viturhosted.net` |
| `CS_CONFIG_PATH`       | A temporary path to store the CipherStash client configuration. | No       | `/home/{username}/.cipherstash`              |

> [!TIP]
> There are some configuration details you should take note of when deploying `@cipherstash/protect` in your production apps.

- If you've created a Workspace in a region other than `ap-southeast-2`, you will need to set the `CS_ZEROKMS_HOST` environment variable to the appropriate region. For example, if you are using ZeroKMS in the `eu-central-1` region, you need to set the `CS_ZEROKMS_HOST` variable to `https://eu-central-1.aws.viturhosted.net`. This is a known usability issue that will be addressed.
- In most hosting environments, the `CS_CONFIG_PATH` environment variable will need to be set to a path that the user running the application has permission to write to. Setting `CS_CONFIG_PATH` to `/tmp/.cipherstash` will work in most cases, and has been tested on [Vercel](https://vercel.com/), [AWS Lambda](https://aws.amazon.com/lambda/), and other hosting environments.

## Contributing

Please read the [contribution guide](CONTRIBUTE.md).

## License

`@cipherstash/protect` is [MIT licensed](./LICENSE.md).
