# Stash Encryption Example with TypeORM

> ⚠️ **Heads-up:** This example was generated with AI with some very specific prompting to make it as useful as possible for you :)
> If you find any issues, think this example is absolutely terrible, or would like to speak with a human, book a call with the [CipherStash solutions engineering team](https://calendly.com/cipherstash-gtm/cipherstash-discovery-call?month=2025-09)

## What this shows
- Field-level encryption on 2+ properties via `encrypt`/`encryptModel` and bulk variants
- Searchable encryption-ready schema for PostgreSQL
- Result contract preserved: operations return `{ data }` or `{ failure }`

## 90-second Quickstart
```bash
pnpm install
cp .env.example .env
pnpm start
```

Environment variables (in `.env`):
```bash
CS_WORKSPACE_CRN=
CS_CLIENT_ID=
CS_CLIENT_KEY=
CS_CLIENT_ACCESS_KEY=
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=cipherstash
DB_PASSWORD=password
DB_DATABASE=cipherstash
```

### 3. Define Your Entity (The Easy Way!)

```typescript
// src/entity/User.ts
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm'
import type { EncryptedData } from '@cipherstash/stack'
import { EncryptedColumn } from '../decorators/encrypted-column'

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

  // 🎯 Just add @EncryptedColumn() - that's it!
  @EncryptedColumn()
  email: EncryptedData | null

  @EncryptedColumn({ nullable: false })
  ssn: EncryptedData

  @EncryptedColumn()
  phone: EncryptedData | null

  @CreateDateColumn()
  createdAt: Date

  @UpdateDateColumn()
  updatedAt: Date
}
```

### 4. Configure Stash Encryption

```typescript
// src/encryption.ts
import { Encryption, encryptedTable, encryptedColumn } from '@cipherstash/stack'

export const encryptedUser = encryptedTable('user', {
  email: encryptedColumn('email').equality().orderAndRange(),
  ssn: encryptedColumn('ssn').equality(),
  phone: encryptedColumn('phone').equality(),
})

export const encryptionClient = await Encryption({
  schemas: [encryptedUser],
})
```

### 5. Use Streamlined Helpers

```typescript
// src/helpers/encryption-entity.ts
import { EncryptionEntityHelper } from './helpers/encryption-entity'

const helper = new EncryptionEntityHelper(encryptionClient)

// 🚀 Bulk create with encryption (recommended for production)
const users = await helper.bulkEncryptAndSave(
  User,
  [
    { firstName: 'John', email: 'john@example.com', ssn: '123-45-6789' },
    { firstName: 'Jane', email: 'jane@example.com', ssn: '987-65-4321' }
  ],
  {
    email: { table: encryptedUser, column: encryptedUser.email },
    ssn: { table: encryptedUser, column: encryptedUser.ssn }
  }
)

// 🔓 Bulk decrypt for display
const decryptedUsers = await helper.bulkDecrypt(allUsers, {
  email: { table: encryptedUser, column: encryptedUser.email },
  ssn: { table: encryptedUser, column: encryptedUser.ssn }
})

// 🔍 Search encrypted data
const foundUser = await helper.searchEncryptedField(
  User,
  'email',
  'john@example.com',
  { table: encryptedUser, column: encryptedUser.email }
)
```

## Architecture Overview

### Before (Complex)
```typescript
// ❌ Old way: Complex lifecycle hooks
@BeforeInsert()
@BeforeUpdate()
beforeUpsert() {
  if (this.email_encrypted) {
    this.email_encrypted = `(${JSON.stringify(JSON.stringify(this.email_encrypted))})`
  }
}

@AfterInsert()
@AfterLoad()
@AfterUpdate()
onLoad() {
  // 30+ lines of complex string parsing...
}
```

### After (Streamlined)
```typescript
// ✅ New way: Just a decorator!
@EncryptedColumn()
email: EncryptedData | null
```

## 📚 Complete Examples

### Single User Creation

```typescript
// Encrypt individual fields
const emailResult = await encryptionClient.encrypt('user@example.com', {
  table: encryptedUser,
  column: encryptedUser.email,
})

if (emailResult.failure) {
  throw new Error(`Encryption failed: ${emailResult.failure.message}`)
}

// Create and save
const user = new User()
user.firstName = 'John'
user.lastName = 'Doe'
user.email = emailResult.data

const savedUser = await AppDataSource.manager.save(user)
```

### Bulk Operations (Production Recommended)

```typescript
const usersToCreate = [
  { firstName: 'Alice', email: 'alice@example.com', ssn: '123-45-6789' },
  { firstName: 'Bob', email: 'bob@example.com', ssn: '987-65-4321' }
]

// 🚀 Single call to ZeroKMS for all users
const savedUsers = await helper.bulkEncryptAndSave(
  User,
  usersToCreate,
  {
    email: { table: encryptedUser, column: encryptedUser.email },
    ssn: { table: encryptedUser, column: encryptedUser.ssn }
  }
)
```

### Model-Level Encryption

```typescript
// Alternative: Encrypt entire model at once
const newUser = {
  firstName: 'David',
  lastName: 'Brown',
  email: 'david@example.com',
  ssn: '111-22-3333'
}

const encryptedModelResult = await encryptionClient.encryptModel(newUser, encryptedUser)

if (encryptedModelResult.failure) {
  throw new Error(`Model encryption failed: ${encryptedModelResult.failure.message}`)
}

const finalUser = new User()
Object.assign(finalUser, encryptedModelResult.data)
await AppDataSource.manager.save(finalUser)
```

## 🔧 Configuration Details

### Data Source Setup

```typescript
// src/data-source.ts
import { DataSource } from 'typeorm'

// Extend DataSource to support encrypted types
const originalInitialize = DataSource.prototype.initialize
DataSource.prototype.initialize = async function (...params) {
  const driver: any = this.driver
  if (!driver.supportedDataTypes.includes('eql_v2_encrypted')) {
    driver.supportedDataTypes.push('eql_v2_encrypted')
  }
  await originalInitialize.call(this, ...params)
  return this
}

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  synchronize: process.env.NODE_ENV !== 'production',
  logging: process.env.NODE_ENV === 'development',
  entities: [User],
})
```

### Encrypted Column Transformer

```typescript
// src/utils/encrypted-column.ts
export const encryptedDataTransformer = {
  to(value: EncryptedData | null): string | null {
    if (value === null) return null
    return `(${JSON.stringify(JSON.stringify(value))})`
  },

  from(value: string | null): EncryptedData | null {
    if (!value) return null
    
    try {
      let jsonString = value.trim()
      if (jsonString.startsWith('(') && jsonString.endsWith(')')) {
        jsonString = jsonString.slice(1, -1)
      }
      jsonString = jsonString.replace(/""/g, '"')
      if (jsonString.startsWith('"') && jsonString.endsWith('"')) {
        jsonString = jsonString.slice(1, -1)
      }
      return JSON.parse(jsonString)
    } catch (error) {
      console.error('Failed to parse encrypted data:', error)
      return null
    }
  },
}
```

## 🎯 Production Best Practices

### 1. Use Bulk Operations
- **Single operations**: Use for individual records
- **Bulk operations**: Use for multiple records (recommended)
- **Model operations**: Use when encrypting entire objects

### 2. Error Handling
```typescript
const result = await encryptionClient.encrypt(data, { table, column })

if (result.failure) {
  // Always handle failures gracefully
  console.error('Encryption failed:', result.failure.message)
  throw new Error('Failed to encrypt sensitive data')
}
```

### 3. Environment Configuration
```typescript
// Use environment variables for all sensitive data
export const encryptionClient = await Encryption({
  schemas: [encryptedUser],
})
```

### 4. Database Setup
```sql
-- Install EQL extension for searchable encryption
-- Download from: https://github.com/cipherstash/encrypt-query-language/releases
-- Then run: psql -f cipherstash-encrypt.sql
```

## Running the example

```bash
# 1. Set up your environment variables
cp .env.example .env
# Edit .env with your CipherStash credentials

# 2. Install dependencies
pnpm install

# 3. Start PostgreSQL database
# (Make sure EQL extension is installed)

# 4. Run the comprehensive demo
pnpm start
```

The demo will show:
- ✅ Single user creation with encryption
- ✅ Bulk operations (production recommended)
- ✅ Bulk decryption for display
- ✅ Searchable encryption queries
- ✅ Model-level encryption
- ✅ Error handling examples

## 🆚 Comparison: Old vs New

| Aspect | Old Implementation | New Implementation |
|--------|-------------------|-------------------|
| **Setup Complexity** | 50+ lines of lifecycle hooks | 1 decorator: `@EncryptedColumn()` |
| **Type Safety** | Manual casting with `any` | Full TypeScript support |
| **Error Handling** | Manual try/catch in hooks | Automatic transformer error handling |
| **Maintainability** | Duplicate code per entity | Reusable utilities and decorators |
| **Performance** | Manual bulk operations | Built-in bulk helper methods |
| **Developer Experience** | Complex PostgreSQL knowledge needed | Transparent abstraction |

## 🎉 Key Benefits

1. **🎯 Developer Experience**: No more complex lifecycle hooks or PostgreSQL internals
2. **🔒 Type Safety**: Full TypeScript support with proper type inference
3. **⚡ Performance**: Optimized bulk operations using ZeroKMS
4. **🛡️ Reliability**: Robust error handling and validation
5. **🔍 Searchable**: Full support for encrypted queries
6. **📦 Reusable**: Clean abstractions that work across your entire application

## 🔗 Next Steps

- **Explore the demo**: Run `npm start` to see all features in action
- **Read the docs**: Check out [Stash Encryption documentation](https://github.com/cipherstash/protectjs/tree/main/docs)
- **Learn concepts**: Understand [searchable encryption](https://github.com/cipherstash/protectjs/blob/main/docs/concepts/searchable-encryption.md)
- **See other examples**: Browse the [examples directory](https://github.com/cipherstash/protectjs/tree/main/examples)

## 🆘 Troubleshooting

### Common Issues

1. **"eql_v2_encrypted type not supported"**
   - Ensure DataSource extension is properly configured
   - Check that EQL extension is installed in PostgreSQL

2. **Encryption failures**
   - Verify CipherStash credentials in `.env`
   - Check workspace configuration and permissions

3. **Data parsing errors**
   - The new implementation handles this automatically
   - Check transformer configuration if using custom setup

### Getting Help

- 📚 [Stash Encryption Documentation](https://github.com/cipherstash/protectjs/tree/main/docs)
- 🐛 [GitHub Issues](https://github.com/cipherstash/protectjs/issues)
- 💬 [Community Support](https://cipherstash.com)

---

**Ready to build secure applications with encrypted data? This streamlined TypeORM integration makes it easier than ever!** 🚀
