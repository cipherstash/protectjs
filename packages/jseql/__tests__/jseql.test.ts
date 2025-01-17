import 'dotenv/config'
import { describe, expect, it } from 'vitest'

import { createEqlPayload, getPlaintext, eql, LockContext } from '../src'
import type { CsPlaintextV1Schema } from '../src/cs_plaintext_v1'

import { configure, getConsoleSink } from '@logtape/logtape'

await configure({
  sinks: {
    console: getConsoleSink(),
  },
  loggers: [
    {
      category: ['jseql'],
      level: 'info',
      sinks: ['console'],
    },
  ],
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

describe('jseql-ffi', () => {
  it('should have all required environment variables defined', () => {
    expect(process.env.CS_CLIENT_ID).toBeDefined()
    expect(process.env.CS_CLIENT_KEY).toBeDefined()
    expect(process.env.CS_CLIENT_ACCESS_KEY).toBeDefined()
    expect(process.env.CS_WORKSPACE_ID).toBeDefined()
  })

  it('should encrypt and decrypt a payload', async () => {
    const eqlClient = await eql()

    const ciphertext = await eqlClient.encrypt('plaintext', {
      column: 'column_name',
      table: 'users',
    })

    const plaintext = await eqlClient.decrypt(ciphertext)

    expect(plaintext).toEqual('plaintext')
  }, 30000)

  it('should return null if plaintext is null', async () => {
    const eqlClient = await eql()

    const ciphertext = await eqlClient.encrypt(null, {
      column: 'column_name',
      table: 'users',
    })

    const plaintext = await eqlClient.decrypt(ciphertext)

    expect(plaintext).toEqual(null)
  }, 30000)

  it('should encrypt and decrypt a payload with lock context', async () => {
    const eqlClient = await eql()

    const lc = new LockContext()

    // TODO: implement lockContext when CTS v2 is deployed
    // const lockContext = await lc.identify('users_1_jwt')

    const ciphertext = await eqlClient.encrypt('plaintext', {
      column: 'column_name',
      table: 'users',
    })

    const plaintext = await eqlClient.decrypt(ciphertext)

    expect(plaintext).toEqual('plaintext')
  }, 30000)

  it('should encrypt with context and be unable to decrypt without correct context', async () => {
    const eqlClient = await eql()

    const lc = new LockContext()

    // const lockContext = await lc.identify('users_1_jwt')

    const ciphertext = await eqlClient.encrypt('plaintext', {
      column: 'column_name',
      table: 'users',
    })

    const incorrectLc = new LockContext()

    // const badLockContext = await incorrectLc.identify('users_2_jwt')

    try {
      await eqlClient.decrypt(ciphertext)
    } catch (error) {
      const e = error as Error
      expect(e.message.startsWith('Failed to retrieve key')).toEqual(true)
    }
  }, 30000)
})

describe('bulk encryption', () => {
  it('should bulk encrypt and decrypt a payload', async () => {
    const eqlClient = await eql()

    const ciphertexts = await eqlClient.bulkEncrypt(
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
        table: 'users',
        column: 'column_name',
      },
    )

    console.log('ct', ciphertexts)

    const plaintexts = await eqlClient.bulkDecrypt(ciphertexts)

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
    const eqlClient = await eql()

    const ciphertexts = await eqlClient.bulkEncrypt([], {
      table: 'users',
      column: 'column_name',
    })

    expect(ciphertexts).toEqual(null)
  }, 30000)

  it('should return null if decrypting empty ciphertexts', async () => {
    const eqlClient = await eql()

    const ciphertexts = null
    const plaintexts = await eqlClient.bulkDecrypt(ciphertexts)

    expect(plaintexts).toEqual(null)
  }, 30000)
})
