import 'dotenv/config'
import { describe, expect, it } from 'vitest'

import {
  LockContext,
  createEqlPayload,
  getPlaintext,
  protect,
  csTable,
  csColumn,
} from '../src'
import type { CsPlaintextV1Schema } from '../src/cs_plaintext_v1'

const users = csTable('users', {
  email: csColumn('email').freeTextSearch().equality().orderAndSort(),
})

describe('createEqlPayload', () => {
  it('should create a payload with the correct default values', () => {
    const result = createEqlPayload({
      plaintext: 'test',
      table: 'users',
      column: 'email',
    })

    const expectedPayload: CsPlaintextV1Schema = {
      v: 1,
      k: 'pt',
      p: 'test',
      i: {
        t: 'users',
        c: 'email',
      },
    }

    expect(result).toEqual(expectedPayload)
  })

  it('should set custom schemaVersion and queryType values when provided', () => {
    const result = createEqlPayload({
      plaintext: 'test',
      table: 'users',
      column: 'email',
      schemaVersion: 2,
      queryType: 'match',
    })

    const expectedPayload: CsPlaintextV1Schema = {
      v: 2,
      k: 'pt',
      p: 'test',
      i: {
        t: 'users',
        c: 'email',
      },
      q: 'match',
    }

    expect(result).toEqual(expectedPayload)
  })

  it('should set plaintext to an empty string if undefined', () => {
    const result = createEqlPayload({
      plaintext: '',
      table: 'users',
      column: 'email',
    })

    expect(result.p).toBe('')
  })
})

describe('getPlaintext', () => {
  it('should return plaintext if payload is valid and key is "pt"', () => {
    const payload: CsPlaintextV1Schema = {
      v: 1,
      k: 'pt',
      p: 'test',
      i: {
        t: 'users',
        c: 'email',
      },
    }

    const result = getPlaintext(payload)

    expect(result).toEqual({
      failure: false,
      plaintext: 'test',
    })
  })

  it('should return an error if payload is missing "p" or key is not "pt"', () => {
    const invalidPayload = {
      v: 1,
      k: 'ct',
      c: 'ciphertext',
      p: '',
      i: {
        t: 'users',
        c: 'email',
      },
    }

    const result = getPlaintext(
      invalidPayload as unknown as CsPlaintextV1Schema,
    )

    expect(result).toEqual({
      failure: true,
      error: new Error('No plaintext data found in the EQL payload'),
    })
  })

  it('should return an error and log if payload is invalid', () => {
    const result = getPlaintext(null as unknown as CsPlaintextV1Schema)

    expect(result).toEqual({
      failure: true,
      error: new Error('No plaintext data found in the EQL payload'),
    })
  })
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

    console.log('ciphertext', ciphertext)

    if (ciphertext.failure) {
      throw new Error(`[protect]: ${ciphertext.failure.message}`)
    }

    const plaintext = await protectClient.decrypt(ciphertext.data)

    console.log('plaintext', plaintext)

    expect(plaintext).toEqual({
      data: null,
    })
  }, 30000)
})

// TODO: Still have some issues with bulk encryption
describe('bulk encryption', () => {
  // it('should bulk encrypt and decrypt a payload', async () => {
  //   const protectClient = await protect(users)
  //   const ciphertexts = await protectClient.bulkEncrypt(
  //     [
  //       {
  //         plaintext: 'test',
  //         id: '1',
  //       },
  //       {
  //         plaintext: 'test2',
  //         id: '2',
  //       },
  //     ],
  //     {
  //       table: users,
  //       column: users.email,
  //     },
  //   )

  //   if (ciphertexts.failure) {
  //     throw new Error(`[protect]: ${ciphertexts.failure.message}`)
  //   }

  //   const plaintexts = await protectClient.bulkDecrypt(ciphertexts.data)

  //   expect(plaintexts).toEqual({
  //     data: [
  //       {
  //         plaintext: 'test',
  //         id: '1',
  //       },
  //       {
  //         plaintext: 'test2',
  //         id: '2',
  //       },
  //     ],
  //   })
  // }, 30000)

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
// const userJwt = ''
// describe('encryption and decryption with lock context', () => {
//   it('should encrypt and decrypt a payload with lock context', async () => {
//     const protectClient = await protect()

//     const lc = new LockContext()
//     const lockContext = await lc.identify(userJwt)

//     const ciphertext = await protectClient
//       .encrypt('plaintext', {
//         column: 'column_name',
//         table: 'users',
//       })
//       .withLockContext(lockContext)

//     const plaintext = await protectClient
//       .decrypt(ciphertext)
//       .withLockContext(lockContext)

//     expect(plaintext).toEqual('plaintext')
//   }, 30000)

//   it('should encrypt with context and be unable to decrypt without context', async () => {
//     const protectClient = await protect()

//     const lc = new LockContext()
//     const lockContext = await lc.identify(userJwt)

//     const ciphertext = await protectClient
//       .encrypt('plaintext', {
//         column: 'column_name',
//         table: 'users',
//       })
//       .withLockContext(lockContext)

//     try {
//       await protectClient.decrypt(ciphertext)
//     } catch (error) {
//       const e = error as Error
//       expect(e.message.startsWith('Failed to retrieve key')).toEqual(true)
//     }
//   }, 30000)

//   it('should bulk encrypt and decrypt a payload with lock context', async () => {
//     const protectClient = await protect()

//     const lc = new LockContext()
//     const lockContext = await lc.identify(userJwt)

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
//           table: 'users',
//           column: 'column_name',
//         },
//       )
//       .withLockContext(lockContext)

//     const plaintexts = await protectClient
//       .bulkDecrypt(ciphertexts)
//       .withLockContext(lockContext)

//     expect(plaintexts).toEqual([
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
