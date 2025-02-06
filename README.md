# CipherStash Protect for JavaScript/TypeScript

[![Package Tests](https://github.com/cipherstash/protectjs/actions/workflows/tests.yaml/badge.svg)](https://github.com/cipherstash/protectjs/actions/workflows/tests.yaml)
[![Built by CipherStash](https://raw.githubusercontent.com/cipherstash/meta/refs/heads/main/csbadge.svg)](https://cipherstash.com)

`@cipherstash/protect` is a JavaScript/TypeScript package for encrypting and decrypting data in PostgreSQL databases.
Encryption operations happen directly in your app, and the ciphertext is stored in your PostgreSQL database.

Every value you encrypt with `@cipherstash/protect` has a unique key, made possible by CipherStash [ZeroKMS](https://cipherstash.com/products/zerokms)'s blazing fast bulk key operations.
Under the hood `@cipherstash/protect` uses CipherStash [Encrypt Query Language (EQL)](https://github.com/cipherstash/encrypt-query-language), and all ZeroKMS data keys are backed by a root key in [AWS KMS](https://docs.aws.amazon.com/kms/latest/developerguide/overview.html).

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

`@cipherstash/protect` is built on to protect data in a PostgreSQL database using industry standard encryption, and a key management service called [ZeroKMS](https://cipherstash.com/products/zerokms) that's built to work with data at scale.

**Features:**
- **Bulk encryption and decryption**: `@cipherstash/protect` uses [ZeroKMS](https://cipherstash.com/products/zerokms) for encrypting and decrypting thousands of records at once, while using a unique key for every value.
- **Single item encryption and decryption**: Just looking for a way to encrypt and decrypt single values? `@cipherstash/protect` has you covered.
- **Really fast:** ZeroKMS's performance makes using millions of unique keys feasible and performant for real-world applications built with `@cipherstash/protect`.
- **Identity-aware encryption**: Lock down access to sensitive data by requiring a valid JWT to perform a decryption.
- **TypeScript support**: Strongly typed with TypeScript interfaces and types.

**Use cases:**
- **Trusted data access**: make sure only your end-users can access their sensitive data stored in your product.
- **Meet compliance requirements faster:** achieve and exceed the data encryption requirements of SOC2 and ISO27001.
- **Reduce the blast radius of data breaches:** limit the impact of exploited vulnerabilities to only the data your end-users can decrypt.

## Installation

Install `@cipherstash/protect` via one of the following methods:

```bash
npm install @cipherstash/protect
# or
yarn add @cipherstash/protect
# or
pnpm add @cipherstash/protect
```

### Bun (experimental)

[Bun](https://bun.sh/) is an alternate JavaScript runtime that targets Node compatibility.
The underlying [CipherStash Client](#cipherstash-client) is written in Rust and adpated to JavaScript using [Neon](https://github.com/neon-bindings/neon).
At the moment, Bun is not supported due to the lack of Node API compatibility.

## Usage

### Define environment variables

Create an account with [CipherStash](https://cipherstash.com) and get your `client id`, `client key`, `workspace id`, and `access key` from the [CipherStash dashboard](https://dashboard.cipherstash.com/).

Create a `.env` file in the root directory of your project with the following contents:

```
CS_CLIENT_ID=your-client-id
CS_CLIENT_KEY=your-client-key
CS_WORKSPACE_ID=your-workspace-id
CS_CLIENT_ACCESS_KEY=your-client-access-key
```

> [!IMPORTANT]
> These values are required to use the `@cipherstash/protect` package.
> The names of the variables must match the values above or the package will not work.

#### client keys

At the time of this writing, you will need to use the [CipherStash CLI to generate a new client key](https://cipherstash.com/docs/how-to/client-keys).

#### workspace id

`CS_WORKSPACE_ID` is the ID of the workspace you want to use, and can be found in the [CipherStash dashboard](  https://dashboard.cipherstash.com/).

#### access key

`CS_CLIENT_ACCESS_KEY` is used to authenticate with the CipherStash API.
You can generate an access token in the dashboard or the CLI.

### Initialize the EQL client

Import the `protect` function from the `@cipherstash/protect` package and initialize a client with your CipherStash credentials.

```typescript
const { protect } = require('@cipherstash/protect')
const protectClient = await protect()
```

.. or using ES6?

```typescript
import { protect } from '@cipherstash/protect'
const protectClient = await protect()
```

### Encrypting data

To encrypt data, use the `encrypt` function.
This function takes a plaintext string and an object with the table and column name as parameters.

```typescript
const ciphertext = await protectClient.encrypt('plaintext', {
  column: 'column_name',
  table: 'users',
})
```

The `encrypt` function returns an object with a `c` key, and the value is the encrypted data.

```typescript
{
  c: 'encrypted-data'
}
```

### Decrypting data

To decrypt data, use the `decrypt` function.
This function takes an encrypted data object and an object with the lock context as parameters.

```typescript
const plaintext = await protectClient.decrypt(ciphertext)
```

The `decrypt` function returns a string with the plaintext data.

### Lock context

> [!CAUTION]
> If you use a lock context to encrypt data, you must also use the same lock context to decrypt the data.
> Otherwise, you will receive a `400` error from ZeroKMS indicating that the request was unable to generate a data key, and you will be unable to decrypt the data.

`@cipherstash/protect` supports lock contexts to ensure that only the intended users can access sensitive data.
To use a lock context, initialize a `LockContext` object with the identity claims.

```typescript
import { LockContext } from '@cipherstash/protect/identify'

// protectClient from the previous steps
const lc = new LockContext()
```

> [!NOTE]
> When initializing a `LockContext` the default context is set to use the `sub` Identity Claim.

**Custom context**

If you want to override the default context, you can pass a custom context to the `LockContext` constructor.

```typescript
import { LockContext } from '@cipherstash/protect/identify'

// protectClient from the previous steps
const lc = new LockContext({
  context: {
    identityClaim: ['sub'], // this is the default context
  },
})
```

**Context and identity claim options**

The context object contains an `identityClaim` property.
The `identityClaim` property must be an array of strings that correspond to the Identity Claim(s) you want to lock the encryption operation to.

Currently supported Identity Claims are:

| Identity Claim | Description |
| -------------- | ----------- |
| `sub`          | The user's subject identifier. |
| `scopes`       | The user's scopes set by your IDP policy. |

#### Identifying the user

The lock context needs to be tied to a specific user.
To identify the user, call the `identify` method on the lock context object.

```typescript
const lockContext = await lc.identify('jwt_token_from_identiti_provider')
```

The `jwt_token_from_identiti_provider` is the JWT token from your identity provider, and can be retrieved from the user's session.

### Lock context with Next.js and Clerk

If you're using [Clerk](https://clerk.com/) as your identity provider, you can use the `protectClerkMiddleware` function to automatically set the CTS token for every user session.

Install the `@cipherstash/nextjs` package:

```bash
npm install @cipherstash/nextjs
# or
yarn add @cipherstash/nextjs
# or
pnpm add @cipherstash/nextjs
```

In your `middleware.ts` file, add the following code:

```typescript
import { clerkMiddleware } from '@clerk/nextjs/server'
import { protectClerkMiddleware } from '@cipherstash/nextjs/clerk'

export default clerkMiddleware(async (auth, req: NextRequest) => {
  return protectClerkMiddleware(auth, req)
})
```

#### Retrieving the CTS token in Next.js 

You can then use the `getCtsToken` function to retrieve the CTS token for the current user session.

```typescript
import { getCtsToken } from '@cipherstash/nextjs'

export default async function Page() {
  const ctsToken = await getCtsToken()

  // getCtsToken returns either
  // ---
  // { success: true, ctsToken: CtsToken }
  // or
  // { success: false, error: string }

  if (!ctsToken.success) {
    // handle error
  }

  return (
    <div>
      <h1>Server side rendered page</h1>
    </div>
  )
}
```

#### Contructing a LockContext with an existing CTS token

Since the CTS token is already available, you can construct a `LockContext` object with the existing CTS token.

```typescript
import { LockContext } from '@cipherstash/protect/identify'
import { getCtsToken } from '@cipherstash/nextjs'

export default async function Page() {
  const ctsToken = await getCtsToken()

  if (!ctsToken.success) {
    // handle error
  }

  const lockContext = new LockContext({
    ctsToken
  })

  return (
    <div>
      <h1>Server side rendered page</h1>
    </div>
  )
}
```

### Encrypting data with a lock context

To encrypt data with a lock context, call the optional `withLockContext` method on the `encrypt` function and pass the lock context object as a parameter.

```typescript
const ciphertext = await protectClient.encrypt('plaintext', {
  table: 'users',
  column: 'email',
}).withLockContext(lockContext)
```

### Decrypting data with a lock context

To decrypt data with a lock context, call the optional `withLockContext` method on the `decrypt` function and pass the lock context object as a parameter.

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
- [Next.js, Drizzle, and Clerk example](https://github.com/cipherstash/protectjs-next-drizzle)

`@cipherstash/protect` can be used with most ORMs that support PostgreSQL.
If you're interested in using `@cipherstash/protect` with a specific ORM, please [create an issue](https://github.com/cipherstash/protectjs/issues/new).

## CipherStash Client

`@cipherstash/protect` is built on top of the CipherStash Client Rust SDK which is integrated with the `@cipherstash/jseql-ffi` package.
The `@cipherstash/jseql-ffi` package is [public on NPM](https://www.npmjs.com/package/@cipherstash/jseql-ffi), and the source code will be released on GitHub soon.

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
