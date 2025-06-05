# Protect.js DynamoDB Helpers

Helpers for using CipherStash [Protect.js](https://github.com/cipherstash/protectjs) with DynamoDB

[![Built by CipherStash](https://raw.githubusercontent.com/cipherstash/meta/refs/heads/main/csbadge.svg)](https://cipherstash.com)
[![NPM version](https://img.shields.io/npm/v/@cipherstash/protect-dynamodb.svg?style=for-the-badge&labelColor=000000)](https://www.npmjs.com/package/@cipherstash/protect-dynamodb)
[![License](https://img.shields.io/npm/l/@cipherstash/protect.svg?style=for-the-badge&labelColor=000000)](https://github.com/cipherstash/protectjs/blob/main/LICENSE.md)

> [!IMPORTANT]
> This package is a work in progress and will have breaking changes until it reaches 1.0.0.

## Installation

```bash
npm install @cipherstash/protect-dynamodb
# or
yarn add @cipherstash/protect-dynamodb
# or
pnpm add @cipherstash/protect-dynamodb
```

## Quick Start

```typescript
import { protectDynamoDB } from '@cipherstash/protect-dynamodb'
import { protect, csColumn, csTable } from '@cipherstash/protect'

// Define your protected table schema
const users = csTable('users', {
  email: csColumn('email').equality(),
})

// Initialize the Protect client
const protectClient = await protect({
  schemas: [users],
})

// Create the DynamoDB helper instance
const protectDynamo = protectDynamoDB({
  protectClient,
})

// Encrypt and store a user
const user = {
  email: 'user@example.com',
}

const encryptedUser = await protectDynamo.encryptModel(user, users)

// Store in DynamoDB
await docClient.send(new PutCommand({
  TableName: 'Users',
  Item: encryptedUser,
}))

// Create search terms for querying
const searchTermsResult = await protectDynamo.createSearchTerms([
  {
    value: 'user@example.com',
    column: users.email,
    table: users,
  },
])

// Query using the search term
const [emailHmac] = searchTermsResult.data
const result = await docClient.send(new GetCommand({
  TableName: 'Users',
  Key: { email__hmac: emailHmac },
}))

// Decrypt the result
const decryptedUser = await protectDynamo.decryptModel<User>(
  result.Item,
  users,
)
```

## Features

### Encryption and Decryption

The package provides methods to encrypt and decrypt data for DynamoDB:

- `encryptModel`: Encrypts a single model
- `bulkEncryptModels`: Encrypts multiple models in bulk
- `decryptModel`: Decrypts a single model
- `bulkDecryptModels`: Decrypts multiple models in bulk

### Search Terms

Create search terms for querying encrypted data:

- `createSearchTerms`: Creates search terms for one or more columns

### DynamoDB Integration

The package automatically handles:
- Converting encrypted data to DynamoDB's format
- Adding HMAC attributes for searchable fields
- Preserving unencrypted fields
- Converting DynamoDB items back to encrypted format for decryption

## Usage Patterns

### Simple Table with Encrypted Fields

```typescript
const users = csTable('users', {
  email: csColumn('email').equality(),
})

// Encrypt and store
const encryptedUser = await protectDynamo.encryptModel({
  pk: 'user#1',
  email: 'user@example.com',
}, users)

// Query using search terms
const searchTerms = await protectDynamo.createSearchTerms([
  {
    value: 'user@example.com',
    column: users.email,
    table: users,
  },
])
```

### Encrypted Partition Key

```typescript
// Table with encrypted partition key
const table = {
  TableName: 'Users',
  AttributeDefinitions: [
    {
      AttributeName: 'email__hmac',
      AttributeType: 'S',
    },
  ],
  KeySchema: [
    {
      AttributeName: 'email__hmac',
      KeyType: 'HASH',
    },
  ],
}
```

### Encrypted Sort Key

```typescript
// Table with encrypted sort key
const table = {
  TableName: 'Users',
  AttributeDefinitions: [
    {
      AttributeName: 'pk',
      AttributeType: 'S',
    },
    {
      AttributeName: 'email__hmac',
      AttributeType: 'S',
    },
  ],
  KeySchema: [
    {
      AttributeName: 'pk',
      KeyType: 'HASH',
    },
    {
      AttributeName: 'email__hmac',
      KeyType: 'RANGE',
    },
  ],
}
```

### Global Secondary Index with Encrypted Key

```typescript
// Table with GSI using encrypted key
const table = {
  TableName: 'Users',
  AttributeDefinitions: [
    {
      AttributeName: 'pk',
      AttributeType: 'S',
    },
    {
      AttributeName: 'email__hmac',
      AttributeType: 'S',
    },
  ],
  KeySchema: [
    {
      AttributeName: 'pk',
      KeyType: 'HASH',
    },
  ],
  GlobalSecondaryIndexes: [
    {
      IndexName: 'EmailIndex',
      KeySchema: [
        {
          AttributeName: 'email__hmac',
          KeyType: 'HASH',
        },
      ],
      Projection: {
        ProjectionType: 'INCLUDE',
        NonKeyAttributes: ['email__source'],
      },
    },
  ],
}
```

## Error Handling

All methods return a `Result` type from `@byteslice/result`:

```typescript
const result = await protectDynamo.encryptModel(user, users)

if (result.failure) {
  // Handle error
  console.error(result.failure.message)
} else {
  // Use encrypted data
  const encryptedData = result.data
}
```

## Type Safety

The package is fully typed and supports TypeScript:

```typescript
type User = {
  pk: string
  email: string
}

// Type-safe encryption
const encryptedUser = await protectDynamo.encryptModel<User>(user, users)

// Type-safe decryption
const decryptedUser = await protectDynamo.decryptModel<User>(item, users)
```