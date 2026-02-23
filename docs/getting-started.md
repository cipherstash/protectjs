# Getting started guide

This getting started guide steps you through:

1. Installing and configuring CipherStash Encryption in a standalone project
2. Encrypting, searching, and decrypting data in a PostgreSQL database

> [!IMPORTANT] 
> **Prerequisites:** Before you start you need to have this software installed:
>
> - [Node.js](https://nodejs.org/)
> - [TypeScript](https://www.typescriptlang.org/)
> - [PostgreSQL](https://www.postgresql.org/) — see PostgreSQL's [documentation for installing](https://www.postgresql.org/download/)

## Table of contents

- [Step 0: Basic file structure](#step-0-basic-file-structure)
- [Step 1: Install @cipherstash/stack](#step-1-install-cipherstashstack)
- [Step 2: Set up credentials](#step-2-set-up-credentials)
- [Step 3: Define your schema](#step-3-define-your-schema)
- [Step 4: Initialize the Encryption client](#step-4-initialize-the-encryption-client)
- [Step 5: Encrypt data](#step-5-encrypt-data)
- [Step 6: Decrypt data](#step-6-decrypt-data)
- [Step 7: Store encrypted data in a database](#step-7-store-encrypted-data-in-a-database)

## Step 0: Basic file structure

The following is the basic file structure of the standalone project for this getting started guide.
In the `src/protect/` directory, we have the table definition in `schema.ts` and the Encryption client in `index.ts`.

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

If you're following this getting started guide with an existing app, skip to [the next step](#step-1-install-cipherstashstack).

If you're following this getting started guide with a clean slate, create a basic structure by running:

```bash
mkdir -p protect-example/src/protect
cd protect-example
git init
npm init -y
```

## Step 1: Install @cipherstash/stack

Install the [`@cipherstash/stack` package](https://www.npmjs.com/package/@cipherstash/stack) with your package manager of choice:

```bash
npm install @cipherstash/stack
# or
yarn add @cipherstash/stack
# or
pnpm add @cipherstash/stack
```

> [!TIP]
> [Bun](https://bun.sh/) is not currently supported due to a lack of [Node-API compatibility](https://github.com/oven-sh/bun/issues/158). Under the hood, `@cipherstash/stack` uses [CipherStash Client](#cipherstash-client) which is written in Rust and embedded using [Neon](https://github.com/neon-bindings/neon).

> [!NOTE] 
> **You need to opt out of bundling when using `@cipherstash/stack`.**
>
> `@cipherstash/stack` uses Node.js specific features and requires the use of the [native Node.js `require`](https://nodejs.org/api/modules.html#requireid).
>
> You need to opt out of bundling for tools like [Webpack](https://webpack.js.org/configuration/externals/), [esbuild](https://webpack.js.org/configuration/externals/), or [Next.js](https://nextjs.org/docs/app/api-reference/config/next-config-js/serverExternalPackages).
>
> Read more about [building and bundling with `@cipherstash/stack`](#builds-and-bundling).

## Step 2: Set up credentials

If you haven't already, sign up for a [CipherStash account](https://cipherstash.com/signup).
Once you have an account, you will create a Workspace which is scoped to your application environment.

Follow the onboarding steps to get your first set of credentials required to use CipherStash Encryption.
By the end of the onboarding, you will have the following environment variables:

```bash
CS_WORKSPACE_CRN= # The workspace identifier
CS_CLIENT_ID= # The client identifier
CS_CLIENT_KEY= # The client key which is used as key material in combination with ZeroKMS
CS_CLIENT_ACCESS_KEY= # The API key used for authenticating with the CipherStash API
```

Save these environment variables to a `.env` file in your project.

## Step 3: Define your schema

CipherStash Encryption uses a schema to define the tables and columns that you want to encrypt and decrypt.

To define your tables and columns, add the following to `src/protect/schema.ts`:

```ts
import { encryptedTable, encryptedColumn } from "@cipherstash/stack/schema";

export const users = encryptedTable("users", {
  email: encryptedColumn("email"),
});

export const orders = encryptedTable("orders", {
  address: encryptedColumn("address"),
});
```

**Searchable encryption:**

If you want to search encrypted data in your PostgreSQL database, you must declare the indexes in schema in `src/protect/schema.ts`:

```ts
import { encryptedTable, encryptedColumn } from "@cipherstash/stack/schema";

export const users = encryptedTable("users", {
  email: encryptedColumn("email").freeTextSearch().equality().orderAndRange(),
});

export const orders = encryptedTable("orders", {
  address: encryptedColumn("address"),
});
```

Read more about [defining your schema](./docs/reference/schema.md).

## Step 4: Initialize the Encryption client

To import the `Encryption` function and initialize a client with your defined schema, add the following to `src/protect/index.ts`:

```ts
import { Encryption } from "@cipherstash/stack";
import { users, orders } from "./schema";

export const client = await Encryption({ schemas: [users, orders] });
```

## Step 5: Encrypt data

The `encrypt` method on the Encryption client is used to encrypt data.
`encrypt` takes a plaintext string, and an object with the table and column as parameters.

Start encrypting data by adding this to `src/index.ts`:

```typescript
import { users } from "./protect/schema";
import { client } from "./protect";

const encryptResult = await client.encrypt("secret@squirrel.example", {
  column: users.email,
  table: users,
});

if (encryptResult.failure) {
  // Handle the failure
  console.log(
    "error when encrypting:",
    encryptResult.failure.type,
    encryptResult.failure.message
  );
}

const ciphertext = encryptResult.data;
console.log("ciphertext:", ciphertext);
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
> Working with large payloads? Check out the [model operations with bulk cryptography functions](./reference/model-operations.md) docs.

## Step 6: Decrypt data

Use the `decrypt` function to decrypt data.
`decrypt` takes an encrypted data object as a parameter.

```typescript
import { client } from "./protect";

const decryptResult = await client.decrypt(ciphertext);

if (decryptResult.failure) {
  // Handle the failure
}

const plaintext = decryptResult.data;
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
> Working with large payloads? Check out the [model operations with bulk cryptography functions](./reference/model-operations.md) docs.

## Step 7: Store encrypted data in a database

Encrypted data can be stored in any database that supports JSONB.

To store the encrypted data, specify the column type as `jsonb`:

```sql
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email jsonb NOT NULL,
);
```

---

### Didn't find what you wanted?

[Click here to let us know what was missing from our docs.](https://github.com/cipherstash/protectjs/issues/new?template=docs-feedback.yml&title=[Docs:]%20Feedback%20on%20getting-started.md)
