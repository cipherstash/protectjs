# Protect.js with TypeORM: How-to Guide

This guide shows you how to integrate [Protect.js](https://github.com/cipherstash/protectjs) with TypeORM to add searchable encryption to your PostgreSQL database. Protect.js enables you to encrypt sensitive data while maintaining the ability to search and query it efficiently.

## What You'll Learn

- How to set up Protect.js with TypeORM
- How to define encrypted columns in your entities
- How to encrypt and decrypt data
- How to perform searchable queries on encrypted data
- Best practices for production use

## Prerequisites

- Node.js 18+ and npm/pnpm
- PostgreSQL database
- CipherStash account and workspace

## Setup

### 1. Install Dependencies

```bash
npm install @cipherstash/protect typeorm pg reflect-metadata dotenv
npm install --save-dev @types/node typescript ts-node tsconfig-paths
```

### 2. Configure Environment Variables

Create a `.env` file in your project root:

```env
# CipherStash configuration
CS_CLIENT_ID=
CS_CLIENT_KEY=
CS_CLIENT_ACCESS_KEY=
CS_WORKSPACE_CRN=

# Database configuration
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=cipherstash
DB_PASSWORD=password
DB_DATABASE=cipherstash
```

### 3. Configure TypeORM Data Source

The key setup is extending TypeORM's DataSource to support the `eql_v2_encrypted` data type:

```typescript
// src/data-source.ts
import { DataSource } from 'typeorm'
import { User } from './entity/User'

// Extend DataSource to support encrypted data types
const originalConnectionConnectFunction = DataSource.prototype.initialize

DataSource.prototype.initialize = async function (...params) {
  if (!this.driver.supportedDataTypes.includes('eql_v2_encrypted')) {
    this.driver.supportedDataTypes.push('eql_v2_encrypted')
  }
  
  await originalConnectionConnectFunction.call(this, ...params)
  return this
}

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  synchronize: true, // Set to false in production
  logging: true,
  entities: [User],
  migrations: [],
  subscribers: [],
})
```

## Defining Encrypted Entities

### 1. Create Your Entity

Define your entity with encrypted columns using the `eql_v2_encrypted` type:

```typescript
// src/entity/User.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  BeforeInsert,
  BeforeUpdate,
  AfterInsert,
  AfterLoad,
  AfterUpdate,
} from 'typeorm'
import type { EncryptedData } from '@cipherstash/protect'

@Entity()
export class User {
  @PrimaryGeneratedColumn()
  id: number

  @Column()
  firstName: string

  @Column()
  lastName: string

  @Column()
  age: number

  @Column({
    type: 'eql_v2_encrypted',
    nullable: true,
  })
  email_encrypted: EncryptedData | null

  // ... lifecycle hooks for data transformation
}
```

### 2. Add Lifecycle Hooks

TypeORM stores encrypted data as PostgreSQL composite literals, so you need hooks to transform the data:

```typescript
@BeforeInsert()
@BeforeUpdate()
beforeUpsert() {
  if (this.email_encrypted) {
    // Convert to PostgreSQL composite literal format: (json_string)
    this.email_encrypted = `(${JSON.stringify(JSON.stringify(this.email_encrypted))})`
  }
}

@AfterInsert()
@AfterLoad()
@AfterUpdate()
onLoad() {
  if (this.email_encrypted && typeof this.email_encrypted === 'string') {
    try {
      let jsonString = this.email_encrypted.trim()
      
      // Remove outer parentheses if they exist
      if (jsonString.startsWith('(') && jsonString.endsWith(')')) {
        jsonString = jsonString.slice(1, -1)
      }
      
      // Handle PostgreSQL's double-quote escaping
      jsonString = jsonString.replace(/""/g, '"')
      
      // Remove outer quotes if they exist
      if (jsonString.startsWith('"') && jsonString.endsWith('"')) {
        jsonString = jsonString.slice(1, -1)
      }
      
      // Parse the JSON string
      this.email_encrypted = JSON.parse(jsonString)
    } catch (error) {
      console.error('Failed to parse encrypted data:', error)
      // Keep the original string if parsing fails
    }
  }
}
```

## Using Protect.js

### 1. Initialize Protect Client

```typescript
// src/protect.ts
import { protect, csColumn, csTable } from '@cipherstash/protect'

// Define your protected schema
export const protectedUser = csTable('user', {
  email_encrypted: csColumn('email_encrypted').equality(),
})

// Initialize the protect client
export const protectClient = await protect({
  schemas: [protectedUser],
})
```

### 2. Encrypting Data

```typescript
// Encrypt sensitive data before saving
const emailToInsert = 'user@example.com'

const encryptedEmail = await protectClient.encrypt(emailToInsert, {
  table: protectedUser,
  column: protectedUser.email_encrypted,
})

if (encryptedEmail.failure) {
  console.error('Failed to encrypt email:', encryptedEmail.error)
  return
}

// Save to database
const user = new User()
user.firstName = 'John'
user.lastName = 'Doe'
user.email_encrypted = encryptedEmail.data

const savedUser = await AppDataSource.manager.save(user)
```

### 3. Decrypting Data

```typescript
// Load users from database
const users = await AppDataSource.manager.find(User)

// Decrypt the data
const decryptedUsers = await Promise.all(
  users.map(async (user) => ({
    ...user,
    email_encrypted: await protectClient.decrypt(user.email_encrypted),
  }))
)
```

### 4. Searchable Queries

```typescript
// Create search terms for encrypted data
const term = await protectClient.createSearchTerms([
  {
    value: 'user@example.com',
    column: protectedUser.email_encrypted,
    table: protectedUser,
    returnType: 'composite-literal', // Required for PostgreSQL
  },
])

if (term.failure) {
  console.error('Failed to create search terms:', term.error)
  return
}

// Search for the encrypted data
const foundUser = await AppDataSource.manager.findOneBy(User, {
  email_encrypted: term.data[0],
})

// Decrypt the found user
const decryptedFoundUser = await protectClient.decrypt(foundUser.email_encrypted)
```

## Production Best Practices

### 1. Use Bulk Operations

For better performance with multiple records, use bulk operations:

```typescript
// Bulk encrypt multiple records
const usersToEncrypt = [
  { email: 'user1@example.com', firstName: 'John' },
  { email: 'user2@example.com', firstName: 'Jane' },
]

const encryptedUsers = await protectClient.bulkEncryptModels(
  usersToEncrypt,
  {
    table: protectedUser,
    column: protectedUser.email_encrypted,
    valueKey: 'email',
  }
)

// Bulk decrypt multiple records
const users = await AppDataSource.manager.find(User)
const decryptedUsers = await protectClient.bulkDecryptModels(
  users,
  {
    table: protectedUser,
    column: protectedUser.email_encrypted,
  }
)
```

### 2. Error Handling

Always handle encryption/decryption failures gracefully:

```typescript
const encryptedEmail = await protectClient.encrypt(email, {
  table: protectedUser,
  column: protectedUser.email_encrypted,
})

if (encryptedEmail.failure) {
  // Log the error and handle appropriately
  console.error('Encryption failed:', encryptedEmail.error)
  throw new Error('Failed to encrypt sensitive data')
}
```

### 3. Environment Configuration

Use environment variables for all sensitive configuration:

```typescript
// src/protect.ts
import 'dotenv/config'

export const protectClient = await protect({
  schemas: [protectedUser],
})
```

## Running the Example

1. Set up your environment variables
2. Install dependencies: `npm install`
3. Start your PostgreSQL database
4. Run the example: `npm start`

## Next Steps

- Explore the [Protect.js documentation](https://docs.cipherstash.com/protectjs) for advanced features
- Check out other examples in the `examples/` directory
- Learn about [searchable encryption concepts](https://docs.cipherstash.com/protectjs/concepts/searchable-encryption)

## Troubleshooting

### Common Issues

1. **"eql_v2_encrypted type not supported"**: Ensure you've extended the DataSource as shown above
2. **Encryption failures**: Check your CipherStash credentials and workspace configuration
3. **Data parsing errors**: Verify your entity lifecycle hooks are correctly implemented

### Getting Help

- Check the [Protect.js documentation](https://www.cipherstash.com/docs/sdks/protect/js)
- Open an issue on [GitHub](https://github.com/cipherstash/protectjs)
