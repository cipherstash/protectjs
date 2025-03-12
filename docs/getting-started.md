## Getting started

This getting started guide steps you through:

- Installing and configuring Protect.js in a standalone project
- Encrypting, searching, and decrypting data in a PostgreSQL database

> [!IMPORTANT]
> **Prerequisites:** Before you start you need to have this software installed:
>  - [Node.js](https://nodejs.org/)
>  - [TypeScript](https://www.typescriptlang.org/)
>  - [PostgreSQL](https://www.postgresql.org/) — see PostgreSQL's [documentation for installing](https://www.postgresql.org/download/)

### Step 0: Basic file structure

This is the basic file structure of the standalone project for this getting started guide.
In the `src/protect/` directory, we have table definition in `schema.ts` and the Protect.js client in `index.ts`.

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

If you are following this getting started guide with an existing app, you can skip to [the next step](#step-1-install-protectjs).

If you are following this getting started guide with a clean slate, create a basic structure by running:

```bash
mkdir -p protect-example/src/protect
cd protect-example
git init
npm init -y
```

## Step 1: Install Protect.js

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

> [!NOTE]
> **You need to opt-out of bundling when using Protect.js.**
>
> Protect.js uses Node.js specific features and requires the use of the [native Node.js `require`](https://nodejs.org/api/modules.html#requireid).
>
> You need to opt-out of bundling for tools like [Webpack](https://webpack.js.org/configuration/externals/), [esbuild](https://webpack.js.org/configuration/externals/), or [Next.js](https://nextjs.org/docs/app/api-reference/config/next-config-js/serverExternalPackages).
>
> Read more about [building and bundling with Protect.js](#builds-and-bundling).

### Step 2: Setup credentials

> [!IMPORTANT]
> Make sure you have [installed the CipherStash CLI](#step-1-install-protectjs) before following these steps.

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
> The `stash setup` command will append to your `.gitignore` file with the `cipherstash.secret.toml` file.

Read more about [configuration via TOML file or environment variables](./docs/reference/configuration.md).

### Step 3: Define your schema

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

### Step 4: Initialize the Protect client

Import the `protect` function and initialize a client with your defined schema, by adding this to `src/protect/index.ts`:

```ts
import { protect } from '@cipherstash/protect'
import { users } from './schema'

// Pass all your tables to the protect function to initialize the client
export const protectClient = await protect(users, orders)
```

The `protect` function requires at least one `csTable` be provided.

### Step 5: Encrypt data

Protect.js provides the `encrypt` function on `protectClient` to encrypt data.
`encrypt` takes a plaintext string, and an object with the table and column as parameters.

Start encrypting data by adding this to `src/index.ts`:

```typescript
import { users } from './protect/schema'
import { protectClient } from './protect'

const encryptResult = await protectClient.encrypt('secret@squirrel.example', {
  column: users.email,
  table: users,
})

if (encryptResult.failure) {
  // Handle the failure
  console.log("error when encrypting:", encryptResult.failure.type, encryptResult.failure.message)
}

const ciphertext = encryptResult.data
console.log("ciphertext:", ciphertext)
```

Run this with:

```bash
npx tsx src/index.ts
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

### Step 6: Decrypt data

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

### Step 7: Store encrypted data in a database

Encrypted data can be stored in any database that supports JSONB.

To store the encrypted data, you will need to specify the column type as `jsonb`:

```sql
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email jsonb NOT NULL,
);
```
