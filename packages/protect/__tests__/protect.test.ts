import 'dotenv/config'
import { describe, expect, it } from 'vitest'

import { LockContext, protect, csTable, csColumn } from '../src'

const users = csTable('users', {
  email: csColumn('email').freeTextSearch().equality().orderAndRange(),
})

describe('encryption and decryption', () => {
  it('should encrypt and decrypt a payload', async () => {
    const protectClient = await protect(users)

    const ciphertext = await protectClient.encrypt('plaintext', {
      column: users.email,
      table: users,
    })

    if (ciphertext.failure) {
      throw new Error(`[protect]: ${ciphertext.failure.message}`)
    }

    const plaintext = await protectClient.decrypt(ciphertext.data)

    expect(plaintext).toEqual({
      data: 'plaintext',
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
})

describe('bulk encryption', () => {
  it('should bulk encrypt and decrypt a payload', async () => {
    const protectClient = await protect(users)
    const ciphertexts = await protectClient.bulkEncrypt(
      [
        {
          plaintext: 'test',
          id: '1',
        },
        {
          plaintext: 'test2',
          id: '2',
        },
      ],
      {
        table: users,
        column: users.email,
      },
    )

    if (ciphertexts.failure) {
      throw new Error(`[protect]: ${ciphertexts.failure.message}`)
    }

    const plaintextResult = await protectClient.bulkDecrypt(ciphertexts.data)

    if (plaintextResult.failure) {
      throw new Error(`[protect]: ${plaintextResult.failure.message}`)
    }

    const plaintexts = plaintextResult.data

    expect(plaintexts).toEqual([
      {
        plaintext: 'test',
        id: '1',
      },
      {
        plaintext: 'test2',
        id: '2',
      },
    ])
  }, 30000)

  it('should return null if plaintexts is empty', async () => {
    const protectClient = await protect(users)
    const ciphertexts = await protectClient.bulkEncrypt([], {
      table: users,
      column: users.email,
    })
    expect(ciphertexts).toEqual({
      data: null,
    })
  }, 30000)

  it('should return null if decrypting empty ciphertexts', async () => {
    const protectClient = await protect(users)
    const ciphertexts = null
    const plaintexts = await protectClient.bulkDecrypt(ciphertexts)
    expect(plaintexts).toEqual({
      data: null,
    })
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
//   it('should encrypt and decrypt a payload with lock context', async () => {
//     const protectClient = await protect(users)

//     const lc = new LockContext()
//     const lockContext = await lc.identify(userJwt)

//     if (lockContext.failure) {
//       throw new Error(`[protect]: ${lockContext.failure.message}`)
//     }

//     const encryptResult = await protectClient
//       .encrypt('plaintext', {
//         column: users.email,
//         table: users,
//       })
//       .withLockContext(lockContext.data)

//     if (encryptResult.failure) {
//       throw new Error(`[protect]: ${encryptResult.failure.message}`)
//     }

//     const plaintext = await protectClient
//       .decrypt(encryptResult.data)
//       .withLockContext(lockContext.data)

//     if (plaintext.failure) {
//       throw new Error(`[protect]: ${plaintext.failure.message}`)
//     }

//     expect(plaintext.data).toEqual('plaintext')
//   }, 30000)

//   it('should encrypt with context and be unable to decrypt without context', async () => {
//     const protectClient = await protect(users)

//     const lc = new LockContext()
//     const lockContext = await lc.identify(userJwt)

//     if (lockContext.failure) {
//       throw new Error(`[protect]: ${lockContext.failure.message}`)
//     }

//     const ciphertext = await protectClient
//       .encrypt('plaintext', {
//         column: users.email,
//         table: users,
//       })
//       .withLockContext(lockContext.data)

//     if (ciphertext.failure) {
//       throw new Error(`[protect]: ${ciphertext.failure.message}`)
//     }

//     try {
//       await protectClient.decrypt(ciphertext.data)
//     } catch (error) {
//       const e = error as Error
//       expect(e.message.startsWith('Failed to retrieve key')).toEqual(true)
//     }
//   }, 30000)

//   it('should bulk encrypt and decrypt a payload with lock context', async () => {
//     const protectClient = await protect(users)

//     const lc = new LockContext()
//     const lockContext = await lc.identify(userJwt)

//     if (lockContext.failure) {
//       throw new Error(`[protect]: ${lockContext.failure.message}`)
//     }

//     const ciphertexts = await protectClient
//       .bulkEncrypt(
//         [
//           {
//             plaintext: 'test',
//             id: '1',
//           },
//           {
//             plaintext: 'test2',
//             id: '2',
//           },
//         ],
//         {
//           table: users,
//           column: users.email,
//         },
//       )
//       .withLockContext(lockContext.data)

//     if (ciphertexts.failure) {
//       throw new Error(`[protect]: ${ciphertexts.failure.message}`)
//     }

//     const plaintexts = await protectClient
//       .bulkDecrypt(ciphertexts.data)
//       .withLockContext(lockContext.data)

//     if (plaintexts.failure) {
//       throw new Error(`[protect]: ${plaintexts.failure.message}`)
//     }

//     expect(plaintexts.data).toEqual([
//       {
//         plaintext: 'test',
//         id: '1',
//       },
//       {
//         plaintext: 'test2',
//         id: '2',
//       },
//     ])
//   }, 30000)
// })
