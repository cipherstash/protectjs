import 'dotenv/config'
import { describe, expect, it, vi } from 'vitest'

import { LockContext, protect, csTable, csColumn } from '../src'

const users = csTable('users', {
  email: csColumn('email').freeTextSearch().equality().orderAndRange(),
  address: csColumn('address').freeTextSearch(),
})

type User = {
  id: string
  email?: string | null
  createdAt?: Date
  updatedAt?: Date
  address?: string | null
  number?: number
}

describe('encryption and decryption', () => {
  it('should encrypt and decrypt a payload', async () => {
    const protectClient = await protect(users)

    const email = 'hello@example.com'

    const ciphertext = await protectClient.encrypt(email, {
      column: users.email,
      table: users,
    })

    if (ciphertext.failure) {
      throw new Error(`[protect]: ${ciphertext.failure.message}`)
    }

    const plaintext = await protectClient.decrypt(ciphertext.data)

    expect(plaintext).toEqual({
      data: email,
    })
  }, 30000)

  it('should return null if plaintext is null', async () => {
    const protectClient = await protect(users)

    const ciphertext = await protectClient.encrypt(null, {
      column: users.email,
      table: users,
    })

    if (ciphertext.failure) {
      throw new Error(`[protect]: ${ciphertext.failure.message}`)
    }

    const plaintext = await protectClient.decrypt(ciphertext.data)

    expect(plaintext).toEqual({
      data: null,
    })
  }, 30000)

  it('should encrypt and decrypt a model', async () => {
    const protectClient = await protect(users)

    // Create a model with decrypted values
    const decryptedModel = {
      id: '1',
      email: 'plaintext',
      createdAt: new Date('2021-01-01'),
      updatedAt: new Date('2021-01-01'),
      address: '123 Main St',
      number: 1,
    }

    // Encrypt the model
    const encryptedModel = await protectClient.encryptModel<User>(
      decryptedModel,
      users,
    )

    if (encryptedModel.failure) {
      throw new Error(`[protect]: ${encryptedModel.failure.message}`)
    }

    // Decrypt the model
    const decryptedResult = await protectClient.decryptModel<User>(
      encryptedModel.data,
    )

    if (decryptedResult.failure) {
      throw new Error(`[protect]: ${decryptedResult.failure.message}`)
    }

    expect(decryptedResult.data).toEqual({
      id: '1',
      email: 'plaintext',
      createdAt: new Date('2021-01-01'),
      updatedAt: new Date('2021-01-01'),
      address: '123 Main St',
      number: 1,
    })
  }, 30000)

  it('should handle null values in a model', async () => {
    const protectClient = await protect(users)

    // Create a model with null values
    const decryptedModel = {
      id: '1',
      email: null,
      createdAt: new Date('2021-01-01'),
      updatedAt: new Date('2021-01-01'),
      number: 1,
      address: null,
    }

    // Encrypt the model
    const encryptedModel = await protectClient.encryptModel<User>(
      decryptedModel,
      users,
    )

    if (encryptedModel.failure) {
      throw new Error(`[protect]: ${encryptedModel.failure.message}`)
    }

    // Decrypt the model
    const decryptedResult = await protectClient.decryptModel<User>(
      encryptedModel.data,
    )

    if (decryptedResult.failure) {
      throw new Error(`[protect]: ${decryptedResult.failure.message}`)
    }

    expect(decryptedResult.data).toEqual({
      id: '1',
      email: null,
      createdAt: new Date('2021-01-01'),
      updatedAt: new Date('2021-01-01'),
      number: 1,
      address: null,
    })
  }, 30000)
})

describe('bulk encryption', () => {
  it('should bulk encrypt and decrypt models', async () => {
    const protectClient = await protect(users)

    // Create models with decrypted values
    const decryptedModels = [
      {
        id: '1',
        email: 'test',
        createdAt: new Date('2021-01-01'),
        updatedAt: new Date('2021-01-01'),
        number: 1,
        address: '123 Main St',
      },
      {
        id: '2',
        email: 'test2',
        createdAt: new Date('2021-01-01'),
        updatedAt: new Date('2021-01-01'),
        number: 2,
        address: null,
      },
    ]

    // Encrypt the models
    const encryptedModels = await protectClient.bulkEncryptModels<User>(
      decryptedModels,
      users,
    )

    if (encryptedModels.failure) {
      throw new Error(`[protect]: ${encryptedModels.failure.message}`)
    }

    // Decrypt the models
    const decryptedResult = await protectClient.bulkDecryptModels<User>(
      encryptedModels.data,
    )

    if (decryptedResult.failure) {
      throw new Error(`[protect]: ${decryptedResult.failure.message}`)
    }

    expect(decryptedResult.data).toEqual([
      {
        id: '1',
        email: 'test',
        createdAt: new Date('2021-01-01'),
        updatedAt: new Date('2021-01-01'),
        number: 1,
        address: '123 Main St',
      },
      {
        id: '2',
        email: 'test2',
        createdAt: new Date('2021-01-01'),
        updatedAt: new Date('2021-01-01'),
        number: 2,
        address: null,
      },
    ])
  }, 30000)

  it('should return empty array if models is empty', async () => {
    const protectClient = await protect(users)

    // Encrypt empty array of models
    const encryptedModels = await protectClient.bulkEncryptModels<User>(
      [],
      users,
    )

    if (encryptedModels.failure) {
      throw new Error(`[protect]: ${encryptedModels.failure.message}`)
    }

    expect(encryptedModels.data).toEqual([])
  }, 30000)

  it('should return empty array if decrypting empty array of models', async () => {
    const protectClient = await protect(users)

    // Decrypt empty array of models
    const decryptedResult = await protectClient.bulkDecryptModels<User>([])

    if (decryptedResult.failure) {
      throw new Error(`[protect]: ${decryptedResult.failure.message}`)
    }

    expect(decryptedResult.data).toEqual([])
  }, 30000)
})

describe('bulk encryption edge cases', () => {
  it('should handle mixed null and non-null values in bulk operations', async () => {
    const protectClient = await protect(users)
    const decryptedModels = [
      {
        id: '1',
        email: 'test1',
        address: null,
        createdAt: new Date('2021-01-01'),
        updatedAt: new Date('2021-01-01'),
        number: 1,
      },
      {
        id: '2',
        email: null,
        address: '123 Main St',
        createdAt: new Date('2021-01-01'),
        updatedAt: new Date('2021-01-01'),
        number: 2,
      },
      {
        id: '3',
        email: 'test3',
        address: '456 Oak St',
        createdAt: new Date('2021-01-01'),
        updatedAt: new Date('2021-01-01'),
        number: 3,
      },
    ]

    // Encrypt the models
    const encryptedModels = await protectClient.bulkEncryptModels<User>(
      decryptedModels,
      users,
    )

    if (encryptedModels.failure) {
      throw new Error(`[protect]: ${encryptedModels.failure.message}`)
    }

    // Decrypt the models
    const decryptedResult = await protectClient.bulkDecryptModels<User>(
      encryptedModels.data,
    )

    if (decryptedResult.failure) {
      throw new Error(`[protect]: ${decryptedResult.failure.message}`)
    }

    expect(decryptedResult.data).toEqual(decryptedModels)
  }, 30000)

  it('should handle empty models in bulk operations', async () => {
    const protectClient = await protect(users)
    const decryptedModels = [
      {
        id: '1',
        createdAt: new Date('2021-01-01'),
        updatedAt: new Date('2021-01-01'),
        number: 1,
      }, // No encrypted fields
      {
        id: '2',
        email: 'test2',
        createdAt: new Date('2021-01-01'),
        updatedAt: new Date('2021-01-01'),
        number: 2,
      },
      {
        id: '3',
        createdAt: new Date('2021-01-01'),
        updatedAt: new Date('2021-01-01'),
        number: 3,
      }, // No encrypted fields
    ]

    // Encrypt the models
    const encryptedModels = await protectClient.bulkEncryptModels<User>(
      decryptedModels,
      users,
    )

    if (encryptedModels.failure) {
      throw new Error(`[protect]: ${encryptedModels.failure.message}`)
    }

    // Decrypt the models
    const decryptedResult = await protectClient.bulkDecryptModels<User>(
      encryptedModels.data,
    )

    if (decryptedResult.failure) {
      throw new Error(`[protect]: ${decryptedResult.failure.message}`)
    }

    expect(decryptedResult.data).toEqual(decryptedModels)
  }, 30000)
})

describe('error handling', () => {
  it('should handle invalid encrypted payloads', async () => {
    const protectClient = await protect(users)
    const validModel = {
      id: '1',
      email: 'test@example.com',
      createdAt: new Date('2021-01-01'),
      updatedAt: new Date('2021-01-01'),
      address: '123 Main St',
      number: 1,
    }

    // First encrypt a valid model
    const encryptedModel = await protectClient.encryptModel<User>(
      validModel,
      users,
    )
    if (encryptedModel.failure) {
      throw new Error(`[protect]: ${encryptedModel.failure.message}`)
    }

    // Create an invalid model by removing required fields
    const invalidModel = {
      id: '1',
      // Missing required fields
    }

    try {
      await protectClient.decryptModel<User>(invalidModel as User)
      throw new Error('Expected decryption to fail')
    } catch (error) {
      expect(error).toBeDefined()
    }
  }, 30000)

  it('should handle missing required fields', async () => {
    const protectClient = await protect(users)
    const model = {
      id: '1',
      email: null,
      createdAt: new Date('2021-01-01'),
      updatedAt: new Date('2021-01-01'),
      address: null,
      number: 1,
    }

    try {
      await protectClient.encryptModel<User>(model, users)
      throw new Error('Expected encryption to fail')
    } catch (error) {
      expect(error).toBeDefined()
    }
  }, 30000)
})

describe('type safety', () => {
  it('should maintain type safety with complex nested objects', async () => {
    const protectClient = await protect(users)
    const model = {
      id: '1',
      email: 'test@example.com',
      createdAt: new Date('2021-01-01'),
      updatedAt: new Date('2021-01-01'),
      address: '123 Main St',
      number: 1,
      metadata: {
        preferences: {
          notifications: true,
          theme: 'dark',
        },
      },
    }

    // Encrypt the model
    const encryptedModel = await protectClient.encryptModel<User>(model, users)

    if (encryptedModel.failure) {
      throw new Error(`[protect]: ${encryptedModel.failure.message}`)
    }

    // Decrypt the model
    const decryptedResult = await protectClient.decryptModel<User>(
      encryptedModel.data,
    )

    if (decryptedResult.failure) {
      throw new Error(`[protect]: ${decryptedResult.failure.message}`)
    }

    expect(decryptedResult.data).toEqual(model)
  }, 30000)
})

describe('performance', () => {
  it('should handle large numbers of models efficiently', async () => {
    const protectClient = await protect(users)
    const largeModels = Array(10)
      .fill(null)
      .map((_, i) => ({
        id: i.toString(),
        email: `test${i}@example.com`,
        address: `Address ${i}`,
        createdAt: new Date('2021-01-01'),
        updatedAt: new Date('2021-01-01'),
        number: i,
      }))

    // Encrypt the models
    const encryptedModels = await protectClient.bulkEncryptModels<User>(
      largeModels,
      users,
    )

    if (encryptedModels.failure) {
      throw new Error(`[protect]: ${encryptedModels.failure.message}`)
    }

    // Decrypt the models
    const decryptedResult = await protectClient.bulkDecryptModels<User>(
      encryptedModels.data,
    )

    if (decryptedResult.failure) {
      throw new Error(`[protect]: ${decryptedResult.failure.message}`)
    }

    expect(decryptedResult.data).toEqual(largeModels)
  }, 60000)
})

// ------------------------
// TODO get LockContext working in CI.
// To manually test locally, uncomment the following lines and provide a valid JWT in the userJwt variable.
// Last successful local test was 2025-05-23 by cj@cipherstash.com
// ------------------------
// const userJwt = ''
// describe('encryption and decryption with lock context', () => {
//   it('should encrypt and decrypt a payload with lock context', async () => {
//     const protectClient = await protect(users)

//     const lc = new LockContext()
//     const lockContext = await lc.identify(userJwt)

//     if (lockContext.failure) {
//       throw new Error(`[protect]: ${lockContext.failure.message}`)
//     }

//     const email = 'hello@example.com'

//     const ciphertext = await protectClient
//       .encrypt(email, {
//         column: users.email,
//         table: users,
//       })
//       .withLockContext(lockContext.data)

//     if (ciphertext.failure) {
//       throw new Error(`[protect]: ${ciphertext.failure.message}`)
//     }

//     const plaintext = await protectClient
//       .decrypt(ciphertext.data)
//       .withLockContext(lockContext.data)

//     expect(plaintext).toEqual({
//       data: email,
//     })
//   }, 30000)

//   it('should encrypt and decrypt a model with lock context', async () => {
//     const protectClient = await protect(users)

//     const lc = new LockContext()
//     const lockContext = await lc.identify(userJwt)

//     if (lockContext.failure) {
//       throw new Error(`[protect]: ${lockContext.failure.message}`)
//     }

//     // Create a model with decrypted values
//     const decryptedModel = {
//       id: '1',
//       email: 'plaintext',
//     }

//     // Encrypt the model with lock context
//     const encryptedModel = await protectClient
//       .encryptModel(decryptedModel, users)
//       .withLockContext(lockContext.data)

//     if (encryptedModel.failure) {
//       throw new Error(`[protect]: ${encryptedModel.failure.message}`)
//     }

//     // Decrypt the model with lock context
//     const decryptedResult = await protectClient
//       .decryptModel(encryptedModel.data)
//       .withLockContext(lockContext.data)

//     if (decryptedResult.failure) {
//       throw new Error(`[protect]: ${decryptedResult.failure.message}`)
//     }

//     expect(decryptedResult.data).toEqual({
//       id: '1',
//       email: 'plaintext',
//     })
//   }, 30000)

//   it('should encrypt with context and be unable to decrypt without context', async () => {
//     const protectClient = await protect(users)

//     const lc = new LockContext()
//     const lockContext = await lc.identify(userJwt)

//     if (lockContext.failure) {
//       throw new Error(`[protect]: ${lockContext.failure.message}`)
//     }

//     // Create a model with decrypted values
//     const decryptedModel = {
//       id: '1',
//       email: 'plaintext',
//     }

//     // Encrypt the model with lock context
//     const encryptedModel = await protectClient
//       .encryptModel(decryptedModel, users)
//       .withLockContext(lockContext.data)

//     if (encryptedModel.failure) {
//       throw new Error(`[protect]: ${encryptedModel.failure.message}`)
//     }

//     try {
//       await protectClient.decryptModel(encryptedModel.data)
//     } catch (error) {
//       const e = error as Error
//       expect(e.message.startsWith('Failed to retrieve key')).toEqual(true)
//     }
//   }, 30000)

//   it('should bulk encrypt and decrypt models with lock context', async () => {
//     const protectClient = await protect(users)

//     const lc = new LockContext()
//     const lockContext = await lc.identify(userJwt)

//     if (lockContext.failure) {
//       throw new Error(`[protect]: ${lockContext.failure.message}`)
//     }

//     // Create models with decrypted values
//     const decryptedModels = [
//       {
//         id: '1',
//         email: 'test',
//       },
//       {
//         id: '2',
//         email: 'test2',
//       },
//     ]

//     // Encrypt the models with lock context
//     const encryptedModels = await protectClient
//       .bulkEncryptModels(decryptedModels, users)
//       .withLockContext(lockContext.data)

//     if (encryptedModels.failure) {
//       throw new Error(`[protect]: ${encryptedModels.failure.message}`)
//     }

//     // Decrypt the models with lock context
//     const decryptedResult = await protectClient
//       .bulkDecryptModels(encryptedModels.data)
//       .withLockContext(lockContext.data)

//     if (decryptedResult.failure) {
//       throw new Error(`[protect]: ${decryptedResult.failure.message}`)
//     }

//     expect(decryptedResult.data).toEqual([
//       {
//         id: '1',
//         email: 'test',
//       },
//       {
//         id: '2',
//         email: 'test2',
//       },
//     ])
//   }, 30000)
// })
