<div align="center">
  <a href="https://cipherstash.com">
    <img alt="CipherStash Logo" loading="lazy" width="128" height="128" decoding="async" data-nimg="1" style="color:transparent" src="https://cipherstash.com/assets/cs-github.png">
  </a>
  <h1>Data security Stack for TypeScript</h1>

<a href="https://cipherstash.com"><img alt="Built by CipherStash" src="https://raw.githubusercontent.com/cipherstash/meta/refs/heads/main/csbadge.svg?style=for-the-badge&labelColor=000"></a>
<a href="https://github.com/cipherstash/protectjs/blob/main/LICENSE.md"><img alt="License" src="https://img.shields.io/npm/l/@cipherstash/protect.svg?style=for-the-badge&labelColor=000000"></a>
<a href="https://cipherstash.com/docs"><img alt="Docs" src="https://img.shields.io/badge/Docs-333333.svg?style=for-the-badge&logo=readthedocs&labelColor=333"></a>
<a href="https://discord.gg/5qwXUFb6PB"><img alt="Join the community on Discord" src="https://img.shields.io/badge/Join%20the%20community-blueviolet.svg?style=for-the-badge&logo=Discord&labelColor=000000&logoWidth=20"></a>

</div>

## What is the stack?

- [Encryption](https://cipherstash.com/docs/encryption): Field-level encryption for TypeScript apps with searchable encrypted queries, zero-knowledge key management, and first-class ORM support.
- [Secrets](https://cipherstash.com/docs/secrets): Zero-trust secrets management with end-to-end encryption. Plaintext never leaves your application.

## Quick look at the stack in action

**Encryption**

```typescript
import { Encryption, encryptedTable, encryptedColumn } from "@cipherstash/stack";

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

**Secrets**

```typescript
import { Secrets } from "@cipherstash/stack";

// 1. Initialize the secrets client
const secrets = new Secrets({ environment: "production" });

// 2. Set a secret with the SDK or the CLI
await secrets.set("DATABASE_URL", "postgres://user:pass@host:5432/db");

// 3. Consume the secret in your application
const { data } = await secrets.get("DATABASE_URL");
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
> Read more about bundling in the [documentation](https://cipherstash.com/docs).

## Features

- **[Searchable encryption](https://cipherstash.com/docs/searchable-encryption)**: query encrypted data with equality, free text search, range, and [JSONB queries](https://cipherstash.com/docs/protect-js)
- **[Type-safe schema](https://cipherstash.com/docs/schema)**: define encrypted tables and columns with `encryptedTable` / `encryptedColumn`
- **[Model & bulk operations](https://cipherstash.com/docs/schema)**: encrypt and decrypt entire objects or batches with [`encryptModel` / `bulkEncryptModels`](./docs/reference/model-operations.md)
- **[Identity-aware encryption](https://cipherstash.com/docs/protect-js)**: bind encryption to user identity with [lock contexts](https://cipherstash.com/docs/protect-js)
- **[Secrets management](https://cipherstash.com/docs/secrets)**: store and retrieve encrypted secrets via the [`Secrets` API](./docs/reference/secrets.md)

## Integrations

- [Encryption + Drizzle](https://cipherstash.com/docs/drizzle)
- [Encryption + Supabase](https://cipherstash.com/docs/supabase)
- [Encryption + DynamoDB](https://cipherstash.com/docs/dynamodb)

## Use cases

- **Trusted data access**: ensure only your end-users can access their sensitive data using identity-bound encryption
- **Sensitive config management**: store API keys and database credentials with zero-trust encryption and full audit trails
- **Reduce breach impact**: limit the blast radius of exploited vulnerabilities to only the data the affected user can decrypt

## Documentation

- [Documentation](https://cipherstash.com/docs)
- [Encryption getting started guide](https://cipherstash.com/docs/encryption/getting-started)
- [Secrets getting started guide](https://cipherstash.com/docs/secrets/getting-started)
- [SDK and API reference](https://cipherstash.com/docs/reference)

## Contributing

Contributions are welcome and highly appreciated. However, before you jump right into it, we would like you to review our [Contribution Guidelines](CONTRIBUTE.md) to make sure you have a smooth experience contributing.

## Security

If you believe you have found a security vulnerability, we encourage you to **_responsibly disclose this and NOT open a public issue_**.

Please email [security@cipherstash.com](mailto:security@cipherstash.com) with details about the vulnerability. We will review your report and provide further instructions for submitting your report.

## License

This project is [MIT licensed](./LICENSE.md).
