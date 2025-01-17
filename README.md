# jseql

[![Package Tests](https://github.com/cipherstash/jseql/actions/workflows/tests.yaml/badge.svg)](https://github.com/cipherstash/jseql/actions/workflows/tests.yaml)
[![Built by CipherStash](https://raw.githubusercontent.com/cipherstash/meta/refs/heads/main/csbadge.svg)](https://cipherstash.com)

`jseql` is a JavaScript/TypeScript package designed to facilitate interaction with [Encrypt Query Language (EQL)](https://github.com/cipherstash/encrypt-query-language). It provides classes and methods to encrypt and decrypt data.

## Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Platform Support](#platform-support)
- [Usage](#usage)
- [Examples](#examples)
- [Contributing](#contributing)
- [License](#license)

## Features

`jseql` leverages [Encrypt Query Language (EQL)](https://github.com/cipherstash/encrypt-query-language) and [CipherStash](https://cipherstash.com) to encrypt data in a PostgreSQL database.

**Features:**
- **Data encryption**: Easily encrypt data with the `encrypt` function. CipherStash uses a unique encryption key for every record in the database. This is also know as **field level encryption.** 
- **Data decryption**: Extract plaintext data from encrypted data using the `decrypt` function.
- **TypeScript support**: Strongly typed with TypeScript interfaces and types.
- **Logging**: Integrated logging using [logtape](https://github.com/logtape/logtape) for debugging and monitoring.

**Use cases:**
- Meet compliance requirements for data encryption in your application.
- Ensure only the intended users can access sensitive data.
- Exceed customer expectations for data security.
- Improve your overall security posture and reduce the risk of data breaches.

## Installation

Install `jseql` via one of the following methods:

```bash
npm install @cipherstash/jseql
# or
yarn add @cipherstash/jseql
```

## Platform Support

### Operating Systems

| Linux  | macOS | Windows |
| ------ | ----- | ------- |
| ✓      | ✓     | ✓       |

### Node.js

Jseql actively supports all current and [maintenance releases of Node](https://github.com/nodejs/LTS#release-schedule). If you're
using a different version of Node and believe it should be supported, let us know.

Older Node version support (minimum v10) may require lower Node-API versions. See the Node [version support matrix](https://nodejs.org/api/n-api.html#node-api-version-matrix) for more details.

### Bun (experimental)

[Bun](https://bun.sh/) is an alternate JavaScript runtime that targets Node compatibility. At the time of this writing, some Node-API functions are [not implemented](https://github.com/oven-sh/bun/issues/158) so Jseql may not work with Bun.

## Usage

### Define environment variables

Create a `.env` file in the root directory of your project with the following contents:

```
CS_CLIENT_ID=your-client-id
CS_CLIENT_KEY=your-client-key
CS_WORKSPACE_ID=your-workspace-id
CS_CLIENT_ACCESS_KEY=your-client-access-key
```

> [!IMPORTANT]
> These values are required to use the `jseql` package.
> The names of the variables must match the values above or the package will not work.

#### client keys

At the time of this writing, you will need to use the [CipherStash CLI to generate a new client key](https://cipherstash.com/docs/how-to/client-keys).

#### workspace id

`CS_WORKSPACE_ID` is the ID of the workspace you want to use, and can be found in the [CipherStash dashboard](  https://dashboard.cipherstash.com/).

#### access key

`CS_CLIENT_ACCESS_KEY` is used to authenticate with the CipherStash API.
You can generate an access token in the dashboard or the CLI.

### Initialize the EQL client

Import the `eql` function from the `@cipherstash/jseql` package and initialize the EQL client with your CipherStash credentials.

```typescript
const { eql } = require('@cipherstash/jseql')
const eqlClient = await eql()
```

.. or using ES6?

```typescript
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { eql } = require('@cipherstash/jseql')

const eqlClient = await eql()
```

We are working on a solution to support the `import` statement in the future.

### Encrypting data

To encrypt data, use the `encrypt` function. This function takes a plaintext string and an object with the table and column name as parameters.

```typescript
const ciphertext = await eqlClient.encrypt('plaintext', {
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

To decrypt data, use the `decrypt` function. This function takes an encrypted data object and an object with the lock context as parameters.

```typescript
const plaintext = await eqlClient.decrypt(ciphertext)
```

The `decrypt` function returns a string with the plaintext data.

```typescript
'plaintext'
```

### Lock context

`jseql` supports lock contexts to ensure that only the intended users can access sensitive data.
To use a lock context, initialize a `LockContext` object with the identity claims.

```typescript
import { LockContext } from '@cipherstash/jseql/identify'

// eqlClient from the previous steps
const lc = new LockContext()
```

> [!NOTE]
> At the time of this writing, the default LockContext is set to use the `sub` Identity Claim, as this is the only Identity Claim that is currently supported.

#### Identifying the user

The lock context needs to be tied to a specific user.
To identify the user, call the `identify` method on the lock context object.

```typescript
const lockContext = await lc.identify('jwt_token_from_identiti_provider')
```

The `jwt_token_from_identiti_provider` is the JWT token from your identity provider, and can be retrieved from the user's session.

### Lock context with Next.js and Clerk

If you're using [Clerk](https://clerk.com/) as your identity provider, you can use the `jseqlClerkMiddleware` function to automatically set the CTS token for every user session. 

In your `middleware.ts` file, add the following code:

```typescript
import { clerkMiddleware } from '@clerk/nextjs/server'
import { jseqlClerkMiddleware } from '@cipherstash/nextjs/clerk'

export default clerkMiddleware(async (auth, req: NextRequest) => {
  return jseqlClerkMiddleware(auth, req)
})
```

You can then use the `getCtsToken` function to retrieve the CTS token for the current user session.

```typescript
import { getCtsToken } from '@cipherstash/nextjs'

export default async function Page() {
  const ctsToken = await getCtsToken()

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
import { LockContext } from '@cipherstash/jseql/identify'
import { getCtsToken } from '@cipherstash/nextjs'

export default async function Page() {
  const ctsToken = await getCtsToken()
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

To encrypt data with a lock context, pass the lock context object as a parameter to the `encrypt` function.

```typescript
const ciphertext = await eqlClient.encrypt('plaintext', {
  table: 'users',
  column: 'email',
  lockContext,
})
```

### Decrypting data with a lock context

To decrypt data with a lock context, pass the lock context object as a parameter to the `decrypt` function.

```typescript
const plaintext = await eqlClient.decrypt(ciphertext, {
  lockContext,
})
```

### Storing encrypted data in a database

To store the encrypted data in PostgreSQL, you will need to specify the column type as `jsonb`. At the time of this writing.

```sql
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  encrypted_data jsonb NOT NULL
);
```

### Buld Encryption/Decryption

If you have a large list of items to encrypt or decrypt, you can use the **`bulkEncrypt`** and **`bulkDecrypt`** methods to batch encryption/decryption.
These methods are more efficient and perform better than the single-item encryption/decryption methods.

#### bulkEncrypt

```ts
const encryptedResults = await eqlClient.bulkEncrypt(plaintextsToEncrypt, {
  column: 'email',
  table: 'Users',
  // lockContext: someLockContext, // if you have one
})
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

4. **`lockContext`** (optional)  
   - **Type**: `LockContext`  
   - **Description**:  
     Additional metadata and tokens for secure encryption/decryption. If not provided, encryption proceeds without a lock context.

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
  // lockContext: someLockContext, // if you have one
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

---

#### bulkDecrypt

```ts
const decryptedResults = await eqlClient.bulkDecrypt(encryptedPayloads, {
  // lockContext: someLockContext, // if needed
})
```

**Parameters**

1. **`encryptedPayloads`**  
   - **Type**: `Array<{ c: string; id: string }> | null`  
   - **Description**:  
     An array of objects containing the **ciphertext** (`c`) and the **id**. If this array is empty or `null`, the function returns `null`.

2. **`lockContext`** (optional)  
   - **Type**: `LockContext`  
   - **Description**:  
     Additional metadata used to securely unlock ciphertext. If not provided, decryption proceeds without it.

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
const decryptedResults = await bulkDecrypt(encryptedPayloads, {
  // lockContext: someLockContext, // if needed
})

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

## Searchable encrypted data

`jseql` does not currently support searching encrypted data.
We are hard at work on this feature and will update this section when it is available.
You can read more about this feature and implementation [here](https://github.com/cipherstash/encrypt-query-language).

## Logging

> [!IMPORTANT]
> `jseql` will NEVER log plaintext data. 
> This is by design to prevent sensitive data from being logged.

`@cipherstash/jseql` and `@cipherstash/nextjs` use [node's built-in debug logging](https://nodejs.org/api/util.html#utildebuglogsection-callback) for logging.

By default, the logger is disabled, but you can enable it by configuring the following environment variables:

```bash
NODE_DEBUG=jseql-debug  # Enable debug logging
NODE_DEBUG=jseql-error  # Enable error logging
NODE_DEBUG=jseql-info   # Enable info logging
NODE_DEBUG=jseql-*      # Enable all logging
```

## Examples

- [Basic example](/apps/basic)
- [Drizzle example](/apps/drizzle)

`jseql` can be used with most ORMs that support PostgreSQL. If you're interested in using `jseql` with a specific ORM, please [create an issue](https://github.com/cipherstash/jseql/issues/new).

## Contributing

Please see the [CONTRIBUTE.md](CONTRIBUTE.md) file for more information.

## License

Please see the [LICENSE](LICENSE.md) file for more information.