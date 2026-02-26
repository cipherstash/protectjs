# DynamoDB integration

CipherStash Encryption provides a DynamoDB helper that transparently encrypts and decrypts items according to your encryption contract.
The helper wraps your existing DynamoDB workflow — you handle the DynamoDB client calls, and the helper handles encryption.

## Table of contents

- [Overview](#overview)
- [How attribute naming works](#how-attribute-naming-works)
- [Installation](#installation)
- [Setting up encryptedDynamoDB](#setting-up-encrypteddynamodb)
- [Encrypting a model](#encrypting-a-model)
- [Decrypting a model](#decrypting-a-model)
- [Bulk operations](#bulk-operations)
  - [Bulk encryption](#bulk-encryption)
  - [Bulk decryption](#bulk-decryption)
- [Querying with encrypted keys](#querying-with-encrypted-keys)
  - [Encrypted partition key](#encrypted-partition-key)
  - [Encrypted sort key](#encrypted-sort-key)
  - [Encrypted attribute in GSI](#encrypted-attribute-in-gsi)
- [Using nested objects](#using-nested-objects)
- [Audit logging](#audit-logging)
- [DynamoDB table design considerations](#dynamodb-table-design-considerations)
- [Error handling](#error-handling)

## Overview

The `encryptedDynamoDB` function creates a helper bound to your `EncryptionClient`.
It provides `encryptModel`, `decryptModel`, `bulkEncryptModels`, and `bulkDecryptModels` methods that work with your DynamoDB items.

Unlike the Supabase and Drizzle integrations, the DynamoDB helper does not wrap a database client.
You use it to encrypt items before sending them to DynamoDB and decrypt items after retrieving them.

## How attribute naming works

CipherStash encrypts each attribute into two DynamoDB attributes:

| Original Attribute | Stored As | Purpose |
|---|---|---|
| `email` | `email__source` | Encrypted ciphertext |
| `email` | `email__hmac` | HMAC for equality lookups (only if `equality` index is set) |

Non-encrypted attributes pass through unchanged. On decryption, the `__source` and `__hmac` attributes are recombined back into the original attribute name with the plaintext value.

Fields without `equality` only get `__source` (no HMAC, so they can't be queried).

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

Create an encryption contract and initialize the helper:

```typescript
import { Encryption, defineContract, encrypted } from '@cipherstash/stack'
import { encryptedDynamoDB } from '@cipherstash/stack/dynamodb'

// 1. Define your encryption contract
const contract = defineContract({
  users: {
    email: encrypted({ type: 'string', equality: true }),
    name: encrypted({ type: 'string' }),
  },
})

// 2. Initialize the encryption client
const client = await Encryption({ contract })

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
  role: 'admin', // Not in contract — will remain unchanged
}

const encryptedResult = await dynamo.encryptModel(user, contract.users)

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

Fields defined in the encryption contract (`email`, `name`) are encrypted.
Fields not in the contract (`id`, `role`) pass through unchanged.

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

const decryptedResult = await dynamo.decryptModel(item, contract.users)

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

const encryptedResult = await dynamo.bulkEncryptModels(items, contract.users)

if (encryptedResult.failure) {
  console.error('Bulk encryption failed:', encryptedResult.failure.message)
  return
}

// Write encrypted items to DynamoDB using BatchWriteItem
```

### Bulk decryption

Use `bulkDecryptModels` for decrypting multiple items:

```typescript
const decryptedResult = await dynamo.bulkDecryptModels(encryptedItems, contract.users)

if (decryptedResult.failure) {
  console.error('Bulk decryption failed:', decryptedResult.failure.message)
  return
}

const decryptedUsers = decryptedResult.data
```

## Querying with encrypted keys

DynamoDB queries use key conditions, so you need to encrypt the search value into its HMAC form. Use `encryptionClient.encryptQuery()` to get the HMAC, then use it in your key condition.

### Encrypted partition key

When an encrypted attribute is the partition key (e.g., `email__hmac`):

```typescript
import { QueryCommand } from "@aws-sdk/lib-dynamodb"

// 1. Encrypt the search value to get the HMAC
const queryResult = await encryptionClient.encryptQuery([{
  value: "alice@example.com",
  contract: contract.users.email,
  queryType: "equality",
}])

if (queryResult.failure) {
  throw new Error(`Query encryption failed: ${queryResult.failure.message}`)
}

const emailHmac = queryResult.data[0]?.hm

// 2. Use the HMAC in a DynamoDB query
const result = await docClient.send(new QueryCommand({
  TableName: "Users",
  KeyConditionExpression: "email__hmac = :email",
  ExpressionAttributeValues: {
    ":email": emailHmac,
  },
}))

// 3. Decrypt the results
const decrypted = await dynamo.bulkDecryptModels(result.Items ?? [], contract.users)
```

### Encrypted sort key

When an encrypted attribute is the sort key:

```typescript
const result = await docClient.send(new GetCommand({
  TableName: "Users",
  Key: {
    pk: "org#1",              // partition key (plain)
    email__hmac: emailHmac,   // sort key (encrypted HMAC)
  },
}))

const decrypted = await dynamo.decryptModel(result.Item, contract.users)
```

### Encrypted attribute in GSI

When querying a Global Secondary Index where the GSI key is an encrypted HMAC:

```typescript
const result = await docClient.send(new QueryCommand({
  TableName: "Users",
  IndexName: "EmailIndex",
  KeyConditionExpression: "email__hmac = :email",
  ExpressionAttributeValues: {
    ":email": emailHmac,
  },
  Limit: 1,
}))

if (result.Items?.length) {
  const decrypted = await dynamo.decryptModel(result.Items[0], contract.users)
}
```

## Using nested objects

The DynamoDB helper supports nested object encryption using nested config objects in the contract:

```typescript
import { Encryption, defineContract, encrypted } from '@cipherstash/stack'
import { encryptedDynamoDB } from '@cipherstash/stack/dynamodb'

const contract = defineContract({
  users: {
    email: encrypted({ type: 'string' }),
    profile: {
      name: encrypted({ type: 'string' }),
      address: {
        street: encrypted({ type: 'string' }),
      },
    },
  },
})

const client = await Encryption({ contract })
const dynamo = encryptedDynamoDB({ encryptionClient: client })

const user = {
  id: '1',
  email: 'user@example.com',
  profile: {
    name: 'Alice Johnson',
    address: {
      street: '123 Main St',
      city: 'Sydney', // Not in contract — unchanged
    },
  },
}

const encryptedResult = await dynamo.encryptModel(user, contract.users)
```

> [!NOTE]
> Nested objects support encryption up to 3 levels deep. Searchable encryption is not supported on nested fields.

## Audit logging

All operations support `.audit()` chaining for audit metadata:

```typescript
const result = await dynamo
  .encryptModel(user, contract.users)
  .audit({
    metadata: {
      sub: "user-id-123",
      action: "user_registration",
      timestamp: new Date().toISOString(),
    },
  })
```

## DynamoDB table design considerations

### Key schema design

| Pattern | Partition Key | Sort Key | Use Case |
|---|---|---|---|
| Plain PK | `pk` (plain) | - | Standard lookup by ID |
| Encrypted PK | `email__hmac` | - | Lookup by encrypted attribute |
| Encrypted SK | `pk` (plain) | `email__hmac` | Composite key with encrypted sort |
| GSI on HMAC | `pk` (plain) | - | Query by encrypted attribute via GSI with `email__hmac` as GSI PK |

### What you CAN query

- Equality on `__hmac` attributes (exact match only)
- `attribute_exists(email__source)` / `attribute_not_exists(email__source)` in condition expressions

### What you CANNOT query

- Range/comparison on encrypted attributes (no `BETWEEN`, `<`, `>` on `__source`)
- Substring matching on encrypted attributes (no `begins_with`, `contains` on `__source`)
- `__source` values are encrypted binary — only equality via `__hmac` is supported

## Error handling

All DynamoDB helper methods return a `Result` type:

```typescript
const result = await dynamo.encryptModel(item, contract.users)

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
