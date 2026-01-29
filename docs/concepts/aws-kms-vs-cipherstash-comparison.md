# Why Protect.js Makes Encryption Simple: A Comparison with AWS KMS

Encrypting data shouldn't require managing binary buffers, base64 encoding, key ARNs, or building custom search solutions. Protect.js eliminates these complexities, giving you encryption that "just works" with a developer-friendly API.

## The Simple Truth: Encrypting a Value

Let's start with the most basic operation—encrypting a single value. Here's what it takes with each solution:

### AWS KMS: Manual Work Required

```typescript
import { KMSClient, EncryptCommand } from '@aws-sdk/client-kms';

// Step 1: Initialize client with region
const client = new KMSClient({ region: 'us-west-2' });

// Step 2: Define your key ARN (must be configured separately)
const keyId = 'arn:aws:kms:us-west-2:123456789012:key/abcd1234-efgh-5678-ijkl-9012mnopqrst';

// Step 3: Write a wrapper function to handle all the manual work
async function encryptWithKMS(plaintext: string): Promise<string> {
  try {
    // Step 4: Convert string to Buffer
    const command = new EncryptCommand({
      KeyId: keyId,  // Must specify key for every operation
      Plaintext: Buffer.from(plaintext),
    });
    
    // Step 5: Send command and get binary response
    const response = await client.send(command);
    
    // Step 6: Handle binary CiphertextBlob (Uint8Array)
    const ciphertext = response.CiphertextBlob;
    
    // Step 7: Manually encode to base64 for storage
    const base64Ciphertext = Buffer.from(ciphertext).toString('base64');
    
    return base64Ciphertext;
  } catch (error) {
    // Step 8: Handle errors manually
    console.error('Error encrypting data:', error);
    throw error;
  }
}

// Usage: 8 steps, manual encoding, try/catch required
const encrypted = await encryptWithKMS('secret@squirrel.example');
```

**What you're managing:**
- ❌ Key ARNs for every operation
- ❌ Binary buffer conversions
- ❌ Base64 encoding/decoding
- ❌ Manual error handling with try/catch
- ❌ Region configuration
- ❌ AWS credential setup

### Protect.js: One Simple Call

```typescript
import { protect, csTable, csColumn } from '@cipherstash/protect';

// One-time setup: Define your schema
const users = csTable('users', {
  email: csColumn('email'),
});

// One-time setup: Initialize client
const protectClient = await protect({
  schemas: [users],
});

// Encrypt: One line, no manual encoding, no key management
const encryptResult = await protectClient.encrypt(
  'secret@squirrel.example',
  { column: users.email, table: users }
);

// Type-safe error handling
if (encryptResult.failure) {
  throw new Error(encryptResult.failure.message);
}

// Done! Returns JSON payload ready for database storage
const ciphertext = encryptResult.data;
```

**What you get:**
- ✅ No key management (handled by ZeroKMS)
- ✅ No binary conversions
- ✅ No base64 encoding
- ✅ Type-safe Result-based error handling
- ✅ JSON payload ready for storage
- ✅ Zero-knowledge encryption by default

## Decryption: The Same Story

### AWS KMS: More Manual Work

```typescript
import { KMSClient, DecryptCommand } from '@aws-sdk/client-kms';

async function decryptWithKMS(base64Ciphertext: string): Promise<string> {
  try {
    // Step 1: Decode from base64 (you stored it this way, remember?)
    const ciphertextBlob = Buffer.from(base64Ciphertext, 'base64');
    
    // Step 2: Create decrypt command
    const command = new DecryptCommand({
      CiphertextBlob: ciphertextBlob,
    });
    
    // Step 3: Send command
    const response = await client.send(command);
    
    // Step 4: Handle binary response
    const plaintext = response.Plaintext;
    
    // Step 5: Convert binary to string
    return Buffer.from(plaintext).toString('utf-8');
  } catch (error) {
    console.error('Error decrypting data:', error);
    throw error;
  }
}
```

### Protect.js: One Line

```typescript
// Decrypt: One call, returns typed value
const decryptResult = await protectClient.decrypt(ciphertext);

if (decryptResult.failure) {
  throw new Error(decryptResult.failure.message);
}

const plaintext = decryptResult.data; // Already a string, typed correctly
```

## Features That AWS KMS Can't Do (Without Major Custom Work)

### 1. Searchable Encryption: Built-in vs. Impossible

**AWS KMS:** Searching encrypted data requires either:
- Decrypting everything and searching in memory (not scalable)
- Storing plaintext indexes (defeats the purpose of encryption)
- Building a custom searchable encryption solution (months of work)

**Protect.js:** Searchable encryption is built-in and works with PostgreSQL:

```typescript
// Just add search capabilities to your schema
const users = csTable('users', {
  email: csColumn('email')
    .freeTextSearch()      // Full-text search
    .equality()           // WHERE email = ?
    .orderAndRange(),     // ORDER BY, range queries
});

// Encrypt as usual
const encryptResult = await protectClient.encrypt(
  'secret@squirrel.example',
  { column: users.email, table: users }
);

// Create search terms and query directly in PostgreSQL
const searchTerms = await protectClient.encryptQuery([{
  value: 'secret',
  column: users.email,
  table: users,
  queryType: 'freeTextSearch',
}]);

// Use with your ORM (Drizzle integration included)
```

**Result:** You can search encrypted data without ever decrypting it. This is impossible with AWS KMS without building a custom solution.

### 2. Identity-Aware Encryption: Built-in vs. Custom Implementation

**AWS KMS:** No built-in support. You must:
- Implement custom logic to associate encryption with user identity
- Manage user-specific keys or key aliases manually
- Use encryption context (key-value pairs) as a workaround

```typescript
// AWS KMS: Custom implementation required
const command = new EncryptCommand({
  KeyId: keyId,
  Plaintext: Buffer.from(plaintext),
  EncryptionContext: {
    'user-id': userId,  // Just metadata, not enforced
    'session-id': sessionId,
  },
});
// You must manually ensure the same context is used for decryption
```

**Protect.js:** Built-in identity-aware encryption with `LockContext`:

```typescript
import { LockContext } from '@cipherstash/protect/identify';

// Create lock context from user JWT (one line)
const lc = new LockContext();
const lockContext = await lc.identify(userJwt);

// Encrypt with lock context (chainable API)
const encryptResult = await protectClient.encrypt(
  'secret@squirrel.example',
  { column: users.email, table: users }
).withLockContext(lockContext);

// Decrypt requires the same lock context (enforced by Protect.js)
const decryptResult = await protectClient.decrypt(ciphertext)
  .withLockContext(lockContext);
```

**Result:** Identity-aware encryption that's enforced by the system, not just metadata you hope developers remember to check.

### 3. Bulk Operations: Native API vs. Manual Batching

**AWS KMS:** No bulk API. You must:
- Manually batch operations
- Handle rate limits yourself
- Manage concurrency
- Deal with partial failures

```typescript
// AWS KMS: Manual batching with rate limit management
const encryptedItems = await Promise.all(
  items.map(item => encryptWithKMS(item))
);
// Hope you don't hit rate limits or need to retry
```

**Protect.js:** Native bulk encryption optimized for performance:

```typescript
// Protect.js: One call for bulk encryption
const bulkPlaintexts = [
  { id: '1', plaintext: 'Alice' },
  { id: '2', plaintext: 'Bob' },
  { id: '3', plaintext: 'Charlie' },
];

const bulkResult = await protectClient.bulkEncrypt(bulkPlaintexts, {
  column: users.name,
  table: users,
});

// Returns map of id -> encrypted value, optimized for performance
const encryptedMap = bulkResult.data;
```

## Developer Experience Comparison

### Error Handling

**AWS KMS:** Try/catch with manual error type checking:

```typescript
try {
  const response = await client.send(command);
} catch (error) {
  // Manually check error types
  if (error.name === 'AccessDeniedException') {
    // Handle access denied
  } else if (error.name === 'InvalidKeyUsageException') {
    // Handle invalid key usage
  }
  // Hope you caught all the error types
}
```

**Protect.js:** Type-safe Result pattern:

```typescript
const result = await protectClient.encrypt(plaintext, options);

if (result.failure) {
  // Type-safe error handling with autocomplete
  switch (result.failure.type) {
    case 'EncryptionError':
      // TypeScript knows this is an EncryptionError
      break;
    case 'ClientInitError':
      // TypeScript knows this is a ClientInitError
      break;
  }
}
```

### Type Safety

**AWS KMS:** Manual typing, binary data handling:

```typescript
// You must manually type everything
const plaintext: string = Buffer.from(response.Plaintext).toString('utf-8');
```

**Protect.js:** Full TypeScript support with inferred types:

```typescript
// TypeScript infers the return type automatically
const plaintext = decryptResult.data; // Type: string
```

### Storage Format

**AWS KMS:** Binary data that needs encoding:

```typescript
// Returns Uint8Array, must encode for storage
const base64 = Buffer.from(ciphertext).toString('base64');
// Store in database as TEXT or BLOB
```

**Protect.js:** JSON payload ready for database:

```typescript
// Returns JSON payload ready for JSONB storage
const ciphertext = encryptResult.data;
// Store directly in PostgreSQL JSONB column
// Example: { c: '\\x61202020202020472aaf602219d48c4a...' }
```

## Complete Workflow Comparison

### AWS KMS: Full Implementation

```typescript
import { KMSClient, EncryptCommand, DecryptCommand } from '@aws-sdk/client-kms';

// Configuration
const client = new KMSClient({ region: 'us-west-2' });
const keyId = 'arn:aws:kms:us-west-2:123456789012:key/abcd1234-efgh-5678-ijkl-9012mnopqrst';

// Encrypt function with all manual work
async function encrypt(plaintext: string): Promise<string> {
  const command = new EncryptCommand({
    KeyId: keyId,
    Plaintext: Buffer.from(plaintext),
  });
  const response = await client.send(command);
  return Buffer.from(response.CiphertextBlob).toString('base64');
}

// Decrypt function with all manual work
async function decrypt(base64Ciphertext: string): Promise<string> {
  const command = new DecryptCommand({
    CiphertextBlob: Buffer.from(base64Ciphertext, 'base64'),
  });
  const response = await client.send(command);
  return Buffer.from(response.Plaintext).toString('utf-8');
}

// Usage
const encrypted = await encrypt('secret@squirrel.example');
const decrypted = await decrypt(encrypted);
```

**Lines of code:** ~25 lines for basic encrypt/decrypt  
**What you manage:** Key ARNs, binary conversions, base64 encoding, error handling, AWS credentials, regions

### Protect.js: Full Implementation

```typescript
import { protect, csTable, csColumn } from '@cipherstash/protect';

// One-time schema definition
const users = csTable('users', {
  email: csColumn('email'),
});

// One-time initialization
const protectClient = await protect({
  schemas: [users],
});

// Encrypt
const encryptResult = await protectClient.encrypt(
  'secret@squirrel.example',
  { column: users.email, table: users }
);

if (encryptResult.failure) {
  throw new Error(encryptResult.failure.message);
}

const ciphertext = encryptResult.data;

// Decrypt
const decryptResult = await protectClient.decrypt(ciphertext);

if (decryptResult.failure) {
  throw new Error(decryptResult.failure.message);
}

const plaintext = decryptResult.data;
```

**Lines of code:** ~20 lines including setup  
**What you manage:** Nothing—Protect.js handles it all

## Feature Comparison

| Feature | AWS KMS | Protect.js |
|---------|---------|------------|
| **Basic Encryption** | ✅ Requires manual buffer/base64 handling | ✅ One-line API, JSON payload |
| **Key Management** | ❌ You manage key ARNs | ✅ Zero-knowledge, automatic |
| **Searchable Encryption** | ❌ Not possible | ✅ Built-in for PostgreSQL |
| **Identity-Aware Encryption** | ❌ Custom implementation | ✅ Built-in `LockContext` |
| **Bulk Operations** | ❌ Manual batching | ✅ Native bulk API |
| **Error Handling** | ❌ Try/catch, manual types | ✅ Type-safe Result pattern |
| **Type Safety** | ❌ Manual typing | ✅ Full TypeScript inference |
| **Storage Format** | ❌ Binary (needs encoding) | ✅ JSON (database-ready) |
| **ORM Integration** | ❌ Manual integration | ✅ Built-in Drizzle support |
| **Zero-Knowledge** | ❌ AWS has key access | ✅ True zero-knowledge |
| **Setup Complexity** | Medium (AWS credentials, regions) | Low (just environment variables) |

## The Bottom Line

**AWS KMS** is a powerful key management service, but using it for application-level encryption requires:
- Writing wrapper functions for every operation
- Managing binary data conversions
- Handling base64 encoding/decoding
- Building custom solutions for searchable encryption
- Implementing identity-aware encryption yourself
- Managing key ARNs and AWS configuration

**Protect.js** gives you:
- A simple, type-safe API
- Built-in searchable encryption
- Built-in identity-aware encryption
- Zero-knowledge key management
- Database-ready JSON payloads
- ORM integration out of the box

**Result:** Focus on building your application, not managing encryption infrastructure.

## When to Use Each

### Use AWS KMS when:
- You need encryption for AWS services (S3, EBS, etc.)
- You're encrypting infrastructure-level resources
- You don't need to search encrypted data
- You're comfortable with manual buffer/base64 handling

### Use Protect.js when:
- You're building applications with databases
- You need to search encrypted data
- You want a developer-friendly API
- You need identity-aware encryption
- You want zero-knowledge key management
- You value type safety and developer experience

---

## References

- [AWS KMS Documentation](https://docs.aws.amazon.com/kms/)
- [CipherStash Protect.js Getting Started](./getting-started.md)
- [CipherStash Schema Reference](./reference/schema.md)
- [Searchable Encryption Concepts](./concepts/searchable-encryption.md)
