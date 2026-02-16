<div align="center">
  <a href="https://cipherstash.com">
    <img alt="CipherStash Logo" loading="lazy" width="128" height="128" decoding="async" data-nimg="1" style="color:transparent" src="https://cipherstash.com/assets/cs-github.png">
  </a>
  <h1>Protect.js</h1>

<a href="https://cipherstash.com"><img alt="Built by CipherStash" src="https://raw.githubusercontent.com/cipherstash/meta/refs/heads/main/csbadge.svg?style=for-the-badge&labelColor=000"></a>
<a href="https://www.npmjs.com/package/@cipherstash/protect"><img alt="NPM version" src="https://img.shields.io/npm/v/@cipherstash/protect.svg?style=for-the-badge&labelColor=000000"></a>
<a href="https://www.npmjs.com/package/@cipherstash/protect"><img alt="npm downloads" src="https://img.shields.io/npm/dm/@cipherstash/protect.svg?style=for-the-badge&labelColor=000000"></a>
<a href="https://github.com/cipherstash/protectjs/blob/main/LICENSE.md"><img alt="License" src="https://img.shields.io/npm/l/@cipherstash/protect.svg?style=for-the-badge&labelColor=000000"></a>
<a href="https://discord.gg/5qwXUFb6PB"><img alt="Join the community on Discord" src="https://img.shields.io/badge/Join%20the%20community-blueviolet.svg?style=for-the-badge&logo=Discord&labelColor=000000&logoWidth=20"></a>

</div>

## Getting Started

Protect.js lets you encrypt every value with its own key—without sacrificing performance or usability. Encryption happens in your app; ciphertext is stored in your database.

Per‑value unique keys are powered by CipherStash [ZeroKMS](https://cipherstash.com/products/zerokms) bulk key operations, backed by a root key in [AWS KMS](https://docs.aws.amazon.com/kms/latest/developerguide/overview.html).

Visit the [documentation](#documentation) below to get started with Protect.js and explore related products.

## Documentation

Visit the documentation for our products to get started:

- **[Protect.js](https://cipherstash.com/docs/protect-js)** - End-to-end field level encryption for JavaScript/TypeScript apps with zero‑knowledge key management
- **[Stash - Secrets Manager](https://getstash.sh/docs)** - Store and manage secrets like API keys and database credentials with zero-trust encryption
- **[Protect.js for Drizzle ORM](https://cipherstash.com/docs/drizzle)** - Seamlessly integrate Protect.js with Drizzle ORM and PostgreSQL

## Features

Protect.js protects data using industry-standard AES encryption and [ZeroKMS](https://cipherstash.com/products/zerokms) for bulk encryption and decryption operations and is up to 14x faster than AWS KMS or Hashicorp Vault. This enables every encrypted value, in every column, in every row in your database to have a unique key, without sacrificing performance.

**Features:**

- **Bulk encryption and decryption**: Encrypt and decrypt thousands of records at once, while using a unique key for every value
- **Identity-aware encryption**: Lock down access to sensitive data by requiring a valid JWT to perform decryption
- **Searchable encryption**: Search encrypted data in PostgreSQL with equality, range, and text search
- **TypeScript support**: Strongly typed with TypeScript interfaces and types
- **Audit trail**: Every decryption event is logged via ZeroKMS Access Intelligence to help you prove compliance

**Use cases:**

- **Trusted data access**: Ensure only your end-users can access their sensitive data
- **Meet compliance requirements faster**: Meet stringent 2026 privacy and security requirements
- **Reduce the blast radius of data breaches**: Limit the impact of exploited vulnerabilities to only the data your end-users can decrypt

> [!IMPORTANT]
> **You need to opt-out of bundling when using Protect.js.** Protect.js uses Node.js specific features and requires the use of the native Node.js `require`. See the [documentation](https://cipherstash.com/docs/protect-js) for bundling configuration guides.

## Community

The Protect.js community can be found on [Discord](https://discord.gg/5qwXUFb6PB) where you can ask questions, voice ideas, and share your projects with other people.

Do note that our [Code of Conduct](CODE_OF_CONDUCT.md) applies to all Protect.js community channels. Users are **highly encouraged** to read and adhere to it to avoid repercussions.

## Contributing

Contributions to Protect.js are welcome and highly appreciated. However, before you jump right into it, we would like you to review our [Contribution Guidelines](CONTRIBUTE.md) to make sure you have a smooth experience contributing to Protect.js.

---

## Security

If you believe you have found a security vulnerability in Protect.js, we encourage you to **_responsibly disclose this and NOT open a public issue_**.

Please email [security@cipherstash.com](mailto:security@cipherstash.com) with details about the vulnerability. We will review your report and provide further instructions for submitting your report.

## License

Protect.js is [MIT licensed](./LICENSE.md).