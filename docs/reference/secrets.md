# Secrets management

CipherStash Secrets provides a high-level API for managing encrypted secrets.
Secrets are encrypted locally before being sent to the CipherStash API, ensuring end-to-end encryption — the API never sees plaintext values.

## Table of contents

- [Overview](#overview)
- [Installation](#installation)
- [Configuration](#configuration)
- [Storing a secret](#storing-a-secret)
- [Retrieving a secret](#retrieving-a-secret)
- [Retrieving multiple secrets](#retrieving-multiple-secrets)
- [Listing secrets](#listing-secrets)
- [Deleting a secret](#deleting-a-secret)
- [Environment isolation](#environment-isolation)
- [Error handling](#error-handling)

## Overview

The `Secrets` class encrypts values locally using `@cipherstash/stack` before storing them in the CipherStash vault.
When you retrieve a secret, the encrypted value is fetched from the API and decrypted locally.
This means your plaintext values never leave your application.

## Installation

The `Secrets` class is included in the `@cipherstash/stack` package:

```bash
npm install @cipherstash/stack
```

Import from the `@cipherstash/stack/secrets` subpath:

```typescript
import { Secrets } from '@cipherstash/stack/secrets'
```

## Configuration

Initialize the `Secrets` client with a `SecretsConfig` object:

```typescript
import { Secrets } from '@cipherstash/stack/secrets'

const secrets = new Secrets({
  workspaceCRN: process.env.CS_WORKSPACE_CRN!,
  clientId: process.env.CS_CLIENT_ID!,
  clientKey: process.env.CS_CLIENT_KEY!,
  environment: 'production',
  apiKey: process.env.CS_CLIENT_ACCESS_KEY!,
})
```

### Configuration options

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `workspaceCRN` | `string` | Yes | Your CipherStash workspace CRN. |
| `clientId` | `string` | Yes | The client identifier for your CipherStash account. |
| `clientKey` | `string` | Yes | The client key used as key material with ZeroKMS. |
| `environment` | `string` | Yes | The environment name (e.g. `'production'`, `'staging'`). Used for keyset isolation. |
| `apiKey` | `string` | Yes | The API key used for authenticating with the CipherStash API. |
| `accessKey` | `string` | No | Optional override for the API access key. |

## Storing a secret

Use the `set` method to store an encrypted secret:

```typescript
const result = await secrets.set('DATABASE_URL', 'postgres://user:pass@host:5432/db')

if (result.failure) {
  console.error('Failed to store secret:', result.failure.message)
  return
}

console.log(result.data.message) // Secret stored successfully
```

The value is encrypted locally before being sent to the API.
The API only ever receives and stores the encrypted payload.

> [!NOTE]
> The number of secrets you can store depends on your [workspace plan](./plans.md#resource-limits):
> Free (100), Pro (500), Business (2,000), Enterprise (unlimited).
> If your workspace has reached its limit, `set` returns an `ApiError`.

## Retrieving a secret

Use the `get` method to retrieve and decrypt a single secret:

```typescript
const result = await secrets.get('DATABASE_URL')

if (result.failure) {
  console.error('Failed to retrieve secret:', result.failure.message)
  return
}

const databaseUrl = result.data // 'postgres://user:pass@host:5432/db'
```

## Retrieving multiple secrets

Use the `getMany` method to retrieve and decrypt multiple secrets in a single request:

```typescript
const result = await secrets.getMany([
  'DATABASE_URL',
  'API_KEY',
  'REDIS_URL',
])

if (result.failure) {
  console.error('Failed to retrieve secrets:', result.failure.message)
  return
}

const { DATABASE_URL, API_KEY, REDIS_URL } = result.data
```

`getMany` returns an object mapping secret names to their decrypted values.

> [!NOTE]
> `getMany` requires a minimum of 2 secret names and supports a maximum of 100 per request.

## Listing secrets

Use the `list` method to list all secrets in the current environment.
Only names and metadata are returned — values remain encrypted:

```typescript
const result = await secrets.list()

if (result.failure) {
  console.error('Failed to list secrets:', result.failure.message)
  return
}

for (const secret of result.data) {
  console.log(secret.name, secret.environment, secret.createdAt)
}
```

Each item in the list is a `SecretMetadata` object:

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Unique identifier for the secret. |
| `name` | `string` | The secret name. |
| `environment` | `string` | The environment the secret belongs to. |
| `createdAt` | `string` | ISO timestamp of when the secret was created. |
| `updatedAt` | `string` | ISO timestamp of when the secret was last updated. |

## Deleting a secret

Use the `delete` method to remove a secret from the vault:

```typescript
const result = await secrets.delete('OLD_API_KEY')

if (result.failure) {
  console.error('Failed to delete secret:', result.failure.message)
  return
}

console.log(result.data.message) // Secret deleted successfully
```

## CLI usage

The `stash` CLI is bundled with `@cipherstash/stack` and available after install.

### Set a secret

```bash
npx stash secrets set --name DATABASE_URL --value "postgres://..." --environment production
npx stash secrets set -n DATABASE_URL -V "postgres://..." -e production
```

### Get a secret

```bash
npx stash secrets get --name DATABASE_URL --environment production
npx stash secrets get -n DATABASE_URL -e production
```

### List secrets

```bash
npx stash secrets list --environment production
npx stash secrets list -e production
```

### Delete a secret

```bash
npx stash secrets delete --name DATABASE_URL --environment production
npx stash secrets delete -n DATABASE_URL -e production --yes  # skip confirmation
```

### CLI flag reference

| Flag | Alias | Description |
|---|---|---|
| `--name` | `-n` | Secret name |
| `--value` | `-V` | Secret value (set only) |
| `--environment` | `-e` | Environment name |
| `--yes` | `-y` | Skip confirmation (delete only) |

The CLI reads credentials from the same `CS_*` environment variables. Use a `.env` file for convenience.

## Environment isolation

Secrets are isolated by environment.
The `environment` value in your `SecretsConfig` determines which keyset is used for encryption and which secrets are visible.

This means you can use the same secret names across environments without conflict:

```typescript
// Production secrets
const prodSecrets = new Secrets({
  // ...credentials
  environment: 'production',
})

// Staging secrets
const stagingSecrets = new Secrets({
  // ...credentials
  environment: 'staging',
})

// These are completely separate secrets
await prodSecrets.set('DATABASE_URL', 'postgres://prod-host/db')
await stagingSecrets.set('DATABASE_URL', 'postgres://staging-host/db')
```

## Error handling

All `Secrets` methods return a `Result` type with either a `data` or `failure` property:

```typescript
const result = await secrets.get('DATABASE_URL')

if (result.failure) {
  switch (result.failure.type) {
    case 'ApiError':
      console.error('API request failed:', result.failure.message)
      break
    case 'NetworkError':
      console.error('Network error:', result.failure.message)
      break
    case 'EncryptionError':
      console.error('Encryption failed:', result.failure.message)
      break
    case 'DecryptionError':
      console.error('Decryption failed:', result.failure.message)
      break
    case 'ClientError':
      console.error('Client error:', result.failure.message)
      break
  }
  return
}
```

### Error types

| Error type | Description |
|------------|-------------|
| `ApiError` | The API returned a non-200 response (e.g. secret not found, plan limit reached). |
| `NetworkError` | A network-level failure occurred (e.g. DNS resolution, timeout). |
| `EncryptionError` | Local encryption of the secret value failed. |
| `DecryptionError` | Local decryption of the retrieved secret failed. |
| `ClientError` | A client-side validation error (e.g. fewer than 2 names passed to `getMany`). |

---

### Didn't find what you wanted?

[Click here to let us know what was missing from our docs.](https://github.com/cipherstash/protectjs/issues/new?template=docs-feedback.yml&title=[Docs:]%20Feedback%20on%20secrets.md)
