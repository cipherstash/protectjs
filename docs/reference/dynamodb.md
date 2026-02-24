# DynamoDB integration

CipherStash Encryption provides a DynamoDB helper that transparently encrypts and decrypts items according to your encryption schema.
The helper wraps your existing DynamoDB workflow — you handle the DynamoDB client calls, and the helper handles encryption.

## Table of contents

- [Overview](#overview)
- [Installation](#installation)
- [Setting up encryptedDynamoDB](#setting-up-encrypteddynamodb)
- [Encrypting a model](#encrypting-a-model)
- [Decrypting a model](#decrypting-a-model)
- [Bulk operations](#bulk-operations)
  - [Bulk encryption](#bulk-encryption)
  - [Bulk decryption](#bulk-decryption)
- [Using nested objects](#using-nested-objects)
- [Error handling](#error-handling)

## Overview

The `encryptedDynamoDB` function creates a helper bound to your `EncryptionClient`.
It provides `encryptModel`, `decryptModel`, `bulkEncryptModels`, and `bulkDecryptModels` methods that work with your DynamoDB items.

Unlike the Supabase and Drizzle integrations, the DynamoDB helper does not wrap a database client.
You use it to encrypt items before sending them to DynamoDB and decrypt items after retrieving them.

## Installation

The DynamoDB helper is included in the `@cipherstash/stack` package:

```bash
npm install @cipherstash/stack
```

Import from the `@cipherstash/stack/dynamodb` subpath:

```typescript
import { encryptedDynamoDB } from '@cipherstash/stack/dynamodb'
```

## Setting up encryptedDynamoDB

Create an encryption schema and initialize the helper:

```typescript
import { Encryption } from '@cipherstash/stack'
import { encryptedDynamoDB } from '@cipherstash/stack/dynamodb'
import { encryptedTable, encryptedColumn } from '@cipherstash/stack/schema'

// 1. Define your encryption schema
const users = encryptedTable('users', {
  email: encryptedColumn('email').equality(),
  name: encryptedColumn('name'),
})

// 2. Initialize the encryption client
const client = await Encryption({ schemas: [users] })

// 3. Create the DynamoDB helper
const dynamo = encryptedDynamoDB({ encryptionClient: client })
```

### Configuration options

The `encryptedDynamoDB` function accepts an `EncryptedDynamoDBConfig` object:

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `encryptionClient` | `EncryptionClient` | Yes | The initialized encryption client. |
| `options.logger` | `{ error: (message, error) => void }` | No | Custom logger for error reporting. |
| `options.errorHandler` | `(error: EncryptedDynamoDBError) => void` | No | Custom error handler callback. |

## Encrypting a model

Use `encryptModel` to encrypt an item before writing it to DynamoDB:

```typescript
import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb'
import { marshall } from '@aws-sdk/util-dynamodb'

const user = {
  id: '1',
  email: 'user@example.com',
  name: 'Alice Johnson',
  role: 'admin', // Not in schema — will remain unchanged
}

const encryptedResult = await dynamo.encryptModel(user, users)

if (encryptedResult.failure) {
  console.error('Encryption failed:', encryptedResult.failure.message)
  return
}

// Write the encrypted item to DynamoDB
const dynamoClient = new DynamoDBClient({})
await dynamoClient.send(
  new PutItemCommand({
    TableName: 'users',
    Item: marshall(encryptedResult.data),
  })
)
```

Fields defined in the encryption schema (`email`, `name`) are encrypted.
Fields not in the schema (`id`, `role`) pass through unchanged.

## Decrypting a model

Use `decryptModel` to decrypt an item after reading it from DynamoDB:

```typescript
import { GetItemCommand } from '@aws-sdk/client-dynamodb'
import { unmarshall } from '@aws-sdk/util-dynamodb'

const response = await dynamoClient.send(
  new GetItemCommand({
    TableName: 'users',
    Key: marshall({ id: '1' }),
  })
)

const item = unmarshall(response.Item!)

const decryptedResult = await dynamo.decryptModel(item, users)

if (decryptedResult.failure) {
  console.error('Decryption failed:', decryptedResult.failure.message)
  return
}

console.log(decryptedResult.data.email) // 'user@example.com'
```

## Bulk operations

### Bulk encryption

Use `bulkEncryptModels` for encrypting multiple items:

```typescript
const items = [
  { id: '1', email: 'alice@example.com', name: 'Alice' },
  { id: '2', email: 'bob@example.com', name: 'Bob' },
]

const encryptedResult = await dynamo.bulkEncryptModels(items, users)

if (encryptedResult.failure) {
  console.error('Bulk encryption failed:', encryptedResult.failure.message)
  return
}

// Write encrypted items to DynamoDB using BatchWriteItem
```

### Bulk decryption

Use `bulkDecryptModels` for decrypting multiple items:

```typescript
const decryptedResult = await dynamo.bulkDecryptModels(encryptedItems, users)

if (decryptedResult.failure) {
  console.error('Bulk decryption failed:', decryptedResult.failure.message)
  return
}

const decryptedUsers = decryptedResult.data
```

## Using nested objects

The DynamoDB helper supports nested object encryption using `encryptedField`:

```typescript
import { encryptedTable, encryptedColumn, encryptedField } from '@cipherstash/stack/schema'

const users = encryptedTable('users', {
  email: encryptedColumn('email'),
  profile: {
    name: encryptedField('profile.name'),
    address: {
      street: encryptedField('profile.address.street'),
    },
  },
})

const dynamo = encryptedDynamoDB({ encryptionClient: client })

const user = {
  id: '1',
  email: 'user@example.com',
  profile: {
    name: 'Alice Johnson',
    address: {
      street: '123 Main St',
      city: 'Sydney', // Not in schema — unchanged
    },
  },
}

const encryptedResult = await dynamo.encryptModel(user, users)
```

> [!NOTE]
> Nested objects support encryption up to 3 levels deep. Searchable encryption is not supported on nested fields.

## Error handling

All DynamoDB helper methods return a `Result` type:

```typescript
const result = await dynamo.encryptModel(item, users)

if (result.failure) {
  console.error('Error:', result.failure.type, result.failure.message)
  return
}

const encryptedItem = result.data
```

You can also provide a custom error handler in the configuration:

```typescript
const dynamo = encryptedDynamoDB({
  encryptionClient: client,
  options: {
    errorHandler: (error) => {
      console.error(`DynamoDB encryption error [${error.code}]:`, error.message)
    },
    logger: {
      error: (message, error) => {
        // Send to your logging service
      },
    },
  },
})
```

---

### Didn't find what you wanted?

[Click here to let us know what was missing from our docs.](https://github.com/cipherstash/protectjs/issues/new?template=docs-feedback.yml&title=[Docs:]%20Feedback%20on%20dynamodb.md)
