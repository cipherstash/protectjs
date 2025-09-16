# NestJS Protect.js Example

This example demonstrates how to integrate Protect.js with NestJS using a singleton pattern for optimal performance and memory efficiency. The app showcases end-to-end encryption of user data with a simple API endpoint that encrypts and decrypts a user model.

## 🚀 What This Example Shows

- **Real Encryption Demo**: A working API endpoint that encrypts and decrypts user data
- **Singleton Pattern**: Efficient Protect client management with proper initialization
- **NestJS Integration**: Clean dependency injection and service architecture
- **Model Encryption**: Full object encryption/decryption with type safety
- **Searchable Encryption**: Configured for PostgreSQL with equality, ordering, and full-text search

## 🏗️ Architecture Overview

### API Endpoint (`GET /`)
Returns a JSON response showing both encrypted and decrypted versions of a user object:

```json
{
  "encryptedUser": {
    "id": "1",
    "email_encrypted": {
      "c": "encrypted_ciphertext",
      ...encrypted_metadata
    },
    "name": "John Doe"
  },
  "decryptedUser": {
    "id": "1", 
    "email_encrypted": "Hello World!",
    "name": "John Doe"
  }
}
```

### Schema Configuration (`src/protect/index.ts`)

The app defines a `users` table with searchable encryption capabilities:

```typescript
export const users = csTable('users', {
  email_encrypted: csColumn('email_encrypted')
    .equality()           // Enables exact match queries
    .orderAndRange()      // Enables sorting and range queries  
    .freeTextSearch(),    // Enables full-text search
})
```

### Protect Singleton Implementation

The singleton pattern ensures efficient client management:

```typescript
let instance: ProtectClient | null = null;
let initializationPromise: Promise<ProtectClient> | null = null;

export async function getProtectInstance(): Promise<ProtectClient> {
  if (instance) {
    return instance;
  }

  if (initializationPromise) {
    return initializationPromise;
  }

  initializationPromise = protect(config);
  instance = await initializationPromise;
  return instance;
}
```

**Benefits:**
- Only one Protect client instance across the entire application
- Concurrent requests don't create duplicate instances
- Proper async initialization handling

### ProtectService (`src/protect/protect.service.ts`)

A NestJS service that wraps the singleton and provides a clean API:

```typescript
@Injectable()
export class ProtectService implements OnModuleInit {
  private client: ProtectClient | null = null;

  async onModuleInit() {
    this.client = await protectClient;
  }

  async encryptModel<T extends Record<string, unknown>>(
    model: Decrypted<T>,
    table: ProtectTable<ProtectTableColumn>,
  ) {
    const client = await this.getClient();
    return client.encryptModel<T>(model, table);
  }

  async decryptModel<T extends Record<string, unknown>>(model: T) {
    const client = await this.getClient();
    return client.decryptModel<T>(model);
  }
}
```

## 🔧 How It Works

### 1. App Service Implementation (`src/app.service.ts`)

The main service demonstrates model encryption and decryption:

```typescript
@Injectable()
export class AppService {
  constructor(private readonly protectService: ProtectService) {}

  async getHello(): Promise<{
    encryptedUser: User
    decryptedUser: Decrypted<User>
  }> {
    // Encrypt a user model
    const encryptedResult = await this.protectService.encryptModel<User>(
      {
        id: '1',
        email_encrypted: 'Hello World!',
        name: 'John Doe',
      },
      users, // The table schema
    )

    if (encryptedResult.failure) {
      throw new Error(`Encryption failed: ${encryptedResult.failure.message}`)
    }

    // Decrypt the encrypted model
    const decryptedResult = await this.protectService.decryptModel<User>(
      encryptedResult.data,
    )

    if (decryptedResult.failure) {
      throw new Error(`Decryption failed: ${decryptedResult.failure.message}`)
    }

    return {
      encryptedUser: encryptedResult.data,
      decryptedUser: decryptedResult.data,
    }
  }
}
```

### 2. Controller Integration (`src/app.controller.ts`)

The controller exposes the encryption demo via a REST endpoint:

```typescript
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  async getHello(): Promise<string> {
    const payload = await this.appService.getHello()
    return JSON.stringify(payload, null, 2)
  }
}
```

### 3. Using ProtectService in Your Own Services

Inject the `ProtectService` into any NestJS service:

```typescript
@Injectable()
export class UserService {
  constructor(private readonly protectService: ProtectService) {}

  async createUser(userData: { email: string; name: string }) {
    // Encrypt individual fields
    const emailResult = await this.protectService.encrypt(
      userData.email, 
      { table: 'users', column: 'email_encrypted' }
    );
    
    if (emailResult.failure) {
      throw new Error(`Email encryption failed: ${emailResult.failure.message}`);
    }

    // Or encrypt entire models
    const encryptedUser = await this.protectService.encryptModel(
      { ...userData, email_encrypted: userData.email },
      users
    );

    return encryptedUser;
  }
}
```

## 🚀 Quick Start

### 1. Install Dependencies

```bash
pnpm install
```

### 2. Environment Setup

Create a `.env` file with your CipherStash credentials:

```bash
CS_WORKSPACE_CRN=your_workspace_crn
CS_CLIENT_ID=your_client_id
CS_CLIENT_KEY=your_client_key
CS_CLIENT_ACCESS_KEY=your_client_access_key
```

### 3. Run the Application

```bash
pnpm start:dev
```

### 4. Test the Encryption Demo

Visit `http://localhost:3000` to see the encryption in action. You'll get a JSON response showing:

- **encryptedUser**: The user object with encrypted email field (as EQL payload)
- **decryptedUser**: The same data decrypted back to plaintext

## 🧪 Testing

### Unit Tests

```bash
pnpm test
```

### E2E Tests

```bash
pnpm test:e2e
```

### Testing with Reset

The singleton pattern includes a reset function for clean test isolation:

```typescript
import { resetProtectInstance } from './protect';

beforeEach(() => {
  resetProtectInstance();
});
```

## 💡 Key Benefits

1. **Performance**: Single Protect client instance across the entire application
2. **Memory Efficiency**: No duplicate clients consuming memory
3. **NestJS Integration**: Proper dependency injection and lifecycle management
4. **Type Safety**: Full TypeScript support with proper error handling
5. **Searchable Encryption**: Ready for PostgreSQL with equality, ordering, and full-text search
6. **Production Ready**: Handles async initialization and error cases properly

## 🔍 What You'll Learn

- How to integrate Protect.js with NestJS using dependency injection
- Implementing a singleton pattern for optimal resource usage
- Model-level encryption and decryption with type safety
- Configuring searchable encryption schemas
- Error handling patterns for encryption operations
- Testing strategies for encrypted applications

## 📁 Project Structure

```
src/
├── main.ts                 # Application bootstrap
├── app.module.ts           # Main module with service registration
├── app.controller.ts       # REST endpoint controller
├── app.service.ts          # Business logic with encryption demo
└── protect/
    ├── index.ts            # Singleton implementation & schema
    ├── protect.service.ts  # NestJS service wrapper
    └── schema.ts           # Alternative schema definition
```

This example provides a solid foundation for building encrypted NestJS applications with Protect.js!