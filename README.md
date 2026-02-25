<div align="center">
  <a href="https://cipherstash.com">
    <img alt="CipherStash Logo" loading="lazy" width="128" height="128" decoding="async" data-nimg="1" style="color:transparent" src="https://cipherstash.com/assets/cs-github.png">
  </a>
  <h1>CipherStash Stack</h1>

<a href="https://cipherstash.com"><img alt="Built by CipherStash" src="https://raw.githubusercontent.com/cipherstash/meta/refs/heads/main/csbadge.svg?style=for-the-badge&labelColor=000"></a>
<a href="https://github.com/cipherstash/protectjs/blob/main/LICENSE.md"><img alt="License" src="https://img.shields.io/npm/l/@cipherstash/protect.svg?style=for-the-badge&labelColor=000000"></a>
<a href="https://discord.gg/5qwXUFb6PB"><img alt="Join the community on Discord" src="https://img.shields.io/badge/Join%20the%20community-blueviolet.svg?style=for-the-badge&logo=Discord&labelColor=000000&logoWidth=20"></a>

</div>

Field-level encryption for TypeScript apps with searchable encrypted queries, zero-knowledge key management, and first-class ORM support. Manage secrets with end-to-end encryption, using the CipherStash [Secrets](https://cipherstash.com/docs/secrets) API.

## Quick example

```typescript
import { Encryption } from "@cipherstash/stack";
import { encryptedTable, encryptedColumn } from "@cipherstash/stack/schema";

// 1. Define your schema
const users = encryptedTable("users", {
  email: encryptedColumn("email").equality().freeTextSearch(),
});

// 2. Initialize the client
const client = await Encryption({ schemas: [users] });

// 3. Encrypt
const { data: ciphertext } = await client.encrypt("secret@example.com", {
  column: users.email,
  table: users,
});

// 4. Decrypt
const { data: plaintext } = await client.decrypt(ciphertext);
// => "secret@example.com"
```

## Install

```bash
npm install @cipherstash/stack
# or
yarn add @cipherstash/stack
# or
pnpm add @cipherstash/stack
# or
bun add @cipherstash/stack
```

> [!IMPORTANT]
> **You need to opt out of bundling when using `@cipherstash/stack`.**
> It uses Node.js specific features and requires the native Node.js `require`.
> You need to opt out of bundling for tools like [Webpack](https://webpack.js.org/configuration/externals/), [esbuild](https://webpack.js.org/configuration/externals/), or [Next.js](https://nextjs.org/docs/app/api-reference/config/next-config-js/serverExternalPackages).

## Prerequisites

- **Node.js** >= 18
- A [CipherStash account](https://cipherstash.com/signup) — follow the onboarding steps to generate credentials
- The following environment variables in your `.env` file:

```bash
CS_WORKSPACE_CRN=     # Workspace identifier
CS_CLIENT_ID=         # Client identifier
CS_CLIENT_KEY=        # Client key (key material for ZeroKMS)
CS_CLIENT_ACCESS_KEY= # API key for CipherStash API
```

## Features

- **Searchable encryption** — query encrypted data with equality, free text search, range, and [JSONB queries](https://cipherstash.com/docs/protect-js)
- **Type-safe schema** — define encrypted tables and columns with `encryptedTable` / `encryptedColumn`
- **Model & bulk operations** — encrypt and decrypt entire objects or batches with [`encryptModel` / `bulkEncryptModels`](./docs/reference/model-operations.md)
- **Identity-aware encryption** — bind encryption to user identity with [lock contexts](https://cipherstash.com/docs/protect-js)
- **Secrets management** — store and retrieve encrypted secrets via the [`Secrets` API](./docs/reference/secrets.md)

## Integrations

### Drizzle

Define encrypted columns directly in your Drizzle schema with auto-encrypting query operators:

```typescript
import { encryptedType, createEncryptionOperators } from "@cipherstash/stack/drizzle";
const encryptionOps = createEncryptionOperators(encryptionClient);
```

[Drizzle integration docs →](./docs/reference/drizzle/drizzle.md)

### Supabase

Encrypted queries that look like normal Supabase queries:

```typescript
import { encryptedSupabase } from "@cipherstash/stack/supabase";
const eSupabase = encryptedSupabase({ encryptionClient: client, supabaseClient: supabase });
```

[Supabase integration docs →](./docs/reference/supabase-sdk.md)

### DynamoDB

Transparent encryption for DynamoDB items with equality lookups:

```typescript
import { encryptedDynamoDB } from "@cipherstash/stack/dynamodb";
const dynamo = encryptedDynamoDB({ encryptionClient: client });
```

[DynamoDB integration docs →](./docs/reference/dynamodb.md)

## Secrets

Zero-trust secrets management with end-to-end encryption — plaintext never leaves your application.

```typescript
import { Secrets } from "@cipherstash/stack/secrets";

const secrets = new Secrets({ environment: "production" });

await secrets.set("DATABASE_URL", "postgres://user:pass@host:5432/db");
const { data } = await secrets.get("DATABASE_URL");
```

[Secrets docs →](./docs/reference/secrets.md)

## Use cases

- **Trusted data access** — ensure only your end-users can access their sensitive data using identity-bound encryption
- **Sensitive config management** — store API keys and database credentials with zero-trust encryption and full audit trails
- **Reduce breach impact** — limit the blast radius of exploited vulnerabilities to only the data the affected user can decrypt

## Documentation

- [Full documentation](https://cipherstash.com/docs) on the CipherStash docs site
- [Getting started guide](./docs/getting-started.md)
- [Reference docs](./docs/) in this repository

## Contributing

Contributions to Protect.js are welcome and highly appreciated. However, before you jump right into it, we would like you to review our [Contribution Guidelines](CONTRIBUTE.md) to make sure you have a smooth experience contributing.

---

## Security

If you believe you have found a security vulnerability, we encourage you to **_responsibly disclose this and NOT open a public issue_**.

Please email [security@cipherstash.com](mailto:security@cipherstash.com) with details about the vulnerability. We will review your report and provide further instructions for submitting your report.

## License

This project is [MIT licensed](./LICENSE.md).
