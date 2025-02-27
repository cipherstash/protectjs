## Bulk encryption and decryption

If you have a large list of items to encrypt or decrypt, you can use the **`bulkEncrypt`** and **`bulkDecrypt`** methods to batch encryption/decryption.
`bulkEncrypt` and `bulkDecrypt` give your app significantly better throughput than the single-item [`encrypt`](../README.md#encrypting-data) / [`decrypt`](../README.md#decrypting-data) methods.

### Bulk encrypting data

```ts
const encryptedResults = await protectClient.bulkEncrypt(plaintextsToEncrypt, {
  column: 'email',
  table: 'Users',
})

if (encryptedResults.failure) {
  // Handle the failure
}

const encryptedValues = encryptedResults.data

// or with lock context

const encryptedResults = await protectClient.bulkEncrypt(plaintextsToEncrypt, {
  column: 'email',
  table: 'Users',
}).withLockContext(lockContext)

if (encryptedResults.failure) {
  // Handle the failure
}

const encryptedValues = encryptedResults.data
```

**Parameters**

1. **`plaintexts`**
   - **Type**: `{ plaintext: string; id: string }[]`
   - **Description**:
     An array of objects containing the **plaintext** and an **id**.
     - **plaintext**: The string you want encrypted.
     - **id**: A unique identifier to map the returned ciphertext back to its source. For example, if you have a `User` with `id: 1`, you might pass `id: '1'`.

2. **`column`**
   - **Type**: `string`
   - **Description**:
     The name of the column you’re encrypting (e.g., "email"). This is typically used in logging or contextual purposes when constructing the payload for the encryption engine.

3. **`table`**
   - **Type**: `string`
   - **Description**:
     The name of the table you’re encrypting data in (e.g., "Users").

**Return value**

- **Type**: `Promise<Result<Array<{ c: string; id: string }> | null, ProtectError>>`
- Returns a `Result` object, where:
  - **`data`** is an array of objects or `null`, where:
    - **`c`** is the ciphertext.
    - **`id`** is the same **id** you passed in, so you can correlate which ciphertext matches which original plaintext.
  - **`failure`** is an object with the following properties:
    - **`type`** is a string with the error type.
    - **`message`** is a string with the error message.

#### Example usage

```ts
// 1) Gather your data. For example, a list of users with plaintext fields.
const users = [
  { id: '1', name: 'CJ', email: 'cj@example.com' },
  { id: '2', name: 'Alex', email: 'alex@example.com' },
]

// 2) Prepare the array for bulk encryption (only encrypting the "email" field here).
const plaintextsToEncrypt = users.map((user) => ({
  plaintext: user.email, // The data to encrypt
  id: user.id,           // Keep track by user ID
}))

// 3) Call bulkEncrypt
const encryptedResults = await bulkEncrypt(plaintextsToEncrypt, {
  column: 'email',
  table: 'Users',
})

if (encryptedResults.failure) {
  // Handle the failure
}

const encryptedValues = encryptedResults.data

// encryptedValues might look like:
// [
//   { c: 'ENCRYPTED_VALUE_1', id: '1' },
//   { c: 'ENCRYPTED_VALUE_2', id: '2' },
// ]

// 4) Reassemble data by matching IDs
if (encryptedValues) {
  encryptedValues.forEach((result) => {
    // Find the corresponding user
    const user = users.find((u) => u.id === result.id)
    if (user) {
      user.email = result.c  // Store ciphertext back into the user object
    }
  })
}
```

### Bulk decrypting data

```ts
const decryptedResults = await protectClient.bulkDecrypt(encryptedPayloads)

// or with lock context

const decryptedResults = await protectClient.bulkDecrypt(encryptedPayloads).withLockContext(lockContext)
```

**Parameters**

1. **`encryptedPayloads`**
   - **Type**: `Array<{ c: string; id: string }> | null`
   - **Description**:
     An array of objects containing the **ciphertext** (`c`) and the **id**. If this array is empty or `null`, the function returns `null`.

**Return value**

- **Type**: `Promise<Result<Array<{ plaintext: string; id: string }> | null, ProtectError>>`
- Returns a `Result` object, where:
  - **`data`** is an array of objects or `null`, where:
    - **`plaintext`** is the decrypted value.
    - **`id`** is the same **id** you passed in, so you can correlate which plaintext matches which original ciphertext.
  - **`failure`** is an object with the following properties:
    - **`type`** is a string with the error type.
    - **`message`** is a string with the error message.

#### Example usage

```ts
// Suppose you've retrieved an array of users where their email fields are ciphertext:
const users = [
  { id: '1', name: 'CJ', email: 'ENCRYPTED_VALUE_1' },
  { id: '2', name: 'Alex', email: 'ENCRYPTED_VALUE_2' },
]

// 1) Prepare the array for bulk decryption
const encryptedPayloads = users.map((user) => ({
  c: user.email,
  id: user.id,
}))

// 2) Call bulkDecrypt
const decryptedResults = await bulkDecrypt(encryptedPayloads)

if (decryptedResults.failure) {
  // Handle the failure
}

const decryptedValues = decryptedResults.data

// decryptedValues might look like:
// [
//   { plaintext: 'cj@example.com', id: '1' },
//   { plaintext: 'alex@example.com', id: '2' },
// ]

// 3) Reassemble data by matching IDs
if (decryptedValues) {
  decryptedValues.forEach((result) => {
    const user = users.find((u) => u.id === result.id)
    if (user) {
      user.email = result.plaintext  // Put the decrypted value back in place
    }
  })
}
```
