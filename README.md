<div align="center">
  <a href="https://cipherstash.com">
    <img alt="CipherStash Logo" loading="lazy" width="128" height="128" decoding="async" data-nimg="1" style="color:transparent" src="https://cipherstash.com/brand/cipherstash-logo-dark.svg">
  </a>
  <h1>CipherStash Stack for TypeScript</h1>

  <p><strong>Data-level access control for TypeScript.</strong><br/>Every sensitive value encrypted with a unique key. Searchable on existing Postgres indexes.<br/>A breach yields ciphertext, nothing useful.</p>

<a href="https://cipherstash.com"><img alt="Built by CipherStash" src="https://raw.githubusercontent.com/cipherstash/meta/refs/heads/main/csbadge.svg?style=for-the-badge&labelColor=000"></a>
<a href="https://github.com/cipherstash/stack/blob/main/LICENSE.md"><img alt="License" src="https://img.shields.io/npm/l/@cipherstash/stack.svg?style=for-the-badge&labelColor=000000"></a>
<a href="https://cipherstash.com/docs"><img alt="Docs" src="https://img.shields.io/badge/Docs-333333.svg?style=for-the-badge&logo=readthedocs&labelColor=333"></a>
<a href="https://discord.gg/5qwXUFb6PB"><img alt="Join the community on Discord" src="https://img.shields.io/badge/Join%20the%20community-blueviolet.svg?style=for-the-badge&logo=Discord&labelColor=000000&logoWidth=20"></a>

</div>

## What is the stack?

CipherStash makes access control cryptographic. The rules aren't configured — they're enforced. Every sensitive value carries a decryption policy that travels with the data, wherever it ends up: past the API response, past an agent tool call, past the database. The stack is the TypeScript surface to that model.

- [Encryption](https://cipherstash.com/docs/stack/cipherstash/encryption): Searchable, application-layer field-level encryption for TypeScript apps. Range queries, exact match, and free-text fuzzy search over encrypted fields with sub-millisecond overhead on existing Postgres indexes. Identity-bound keys via `LockContext`. First-class ORM support.

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
const encryptResult = await client.encrypt("secret@example.com", {
  column: users.email,
  table: users,
});
if (encryptResult.failure) {
  // Handle errors your way
}

// 4. Decrypt
const decryptResult = await client.decrypt(encryptResult.data);
if (decryptResult.failure) {
  // Handle errors your way
}
// decryptResult.data => "secret@example.com"
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
> Read more about bundling in the [documentation](https://cipherstash.com/docs/stack/deploy/bundling).

## Features

- **[Searchable encryption](https://cipherstash.com/docs/stack/cipherstash/encryption/searchable-encryption)**: query encrypted data with equality, free text search, range, and [JSONB queries](https://cipherstash.com/docs/stack/cipherstash/encryption/searchable-encryption#jsonb-queries-with-searchablejson).
- **[Type-safe schema](https://cipherstash.com/docs/stack/cipherstash/encryption/schema)**: define encrypted tables and columns with `encryptedTable` / `encryptedColumn`
- **[Model & bulk operations](https://cipherstash.com/docs/stack/cipherstash/encryption/encrypt-decrypt#model-operations)**: encrypt and decrypt entire objects or batches with `encryptModel` / `bulkEncryptModels`.
- **[Identity-aware encryption](https://cipherstash.com/docs/stack/cipherstash/encryption/identity)**: bind encryption to user identity with lock contexts for policy-based access control.

## Integrations

- [Encryption + Drizzle](https://cipherstash.com/docs/stack/cipherstash/encryption/drizzle)
- [Encryption + Supabase](https://cipherstash.com/docs/stack/cipherstash/encryption/supabase)
- [Encryption + DynamoDB](https://cipherstash.com/docs/stack/cipherstash/encryption/dynamodb)

## Use cases

- **A breach yields ciphertext, nothing useful** — limit the blast radius of compromised credentials and exploited vulnerabilities to the data the attacker's identity can decrypt.
- **Per-value access policy** — enforce who can decrypt what, wherever the data ends up.
- **Agent-safe by design** — sensitive values stay encrypted through agent tool calls and downstream pipelines until the right identity asks for them.
- **Faster, simpler, and more reliable than row-level security** — the policy travels with the data, not the database connection.

## Documentation

- [Documentation](https://cipherstash.com/docs)
- [Quickstart](https://cipherstash.com/docs/stack/quickstart)
- [SDK and API reference](https://cipherstash.com/docs/stack/reference)

## Contributing

Contributions are welcome and highly appreciated. However, before you jump right into it, we would like you to review our [Contribution Guidelines](CONTRIBUTE.md) to make sure you have a smooth experience contributing.

## Security

For our full security policy, supported versions, and contributor guidelines, see [SECURITY.md](./SECURITY.md).

## License

This project is [MIT licensed](./LICENSE.md).
