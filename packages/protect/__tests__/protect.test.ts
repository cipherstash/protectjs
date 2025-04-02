import 'dotenv/config'
import { describe, expect, it } from 'vitest'

import { LockContext, protect, csTable, csColumn } from '../src'

const users = csTable('users', {
  email: csColumn('email').freeTextSearch().equality().orderAndRange(),
  address: csColumn('address'),
})

type User = {
  id: string
  email: string | null
  createdAt: Date
  updatedAt: Date
  address: string | null
  number: number
}

describe('encryption and decryption', () => {
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
    const encryptedModels = await protectClient.bulkEncryptModels(
      decryptedModels,
      users,
    )

    if (encryptedModels.failure) {
      throw new Error(`[protect]: ${encryptedModels.failure.message}`)
    }

    // Decrypt the models
    const decryptedResult = await protectClient.bulkDecryptModels(
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
    const encryptedModels = await protectClient.bulkEncryptModels([], users)

    if (encryptedModels.failure) {
      throw new Error(`[protect]: ${encryptedModels.failure.message}`)
    }

    expect(encryptedModels.data).toEqual([])
  }, 30000)

  it('should return empty array if decrypting empty array of models', async () => {
    const protectClient = await protect(users)

    // Decrypt empty array of models
    const decryptedResult = await protectClient.bulkDecryptModels([])

    if (decryptedResult.failure) {
      throw new Error(`[protect]: ${decryptedResult.failure.message}`)
    }

    expect(decryptedResult.data).toEqual([])
  }, 30000)
})

// ------------------------
// TODO get bulk Encryption/Decryption working in CI.
// These tests pass locally, given you provide a valid JWT.
// To manually test locally, uncomment the following lines and provide a valid JWT in the userJwt variable.
// ------------------------
// const userJwt =
//   ''
// describe('encryption and decryption with lock context', () => {
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
