import 'dotenv/config'
import { describe, expect, it } from 'vitest'

import { createEqlPayload, getPlaintext, eql, LockContext } from '../src'
import type { CsPlaintextV1Schema } from '../src/cs_plaintext_v1'

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

  it('should encrypt and decrypt a payload with lock context', async () => {
    const eqlClient = await eql()

    const lc = new LockContext(eqlClient, {
      identityClaim: ['sub'],
    })

    const lockContext = await lc.identify('test', {
      fetchFromCts: false,
    })

    const ciphertext = await eqlClient.encrypt('plaintext', {
      column: 'column_name',
      table: 'users',
      lockContext: lockContext,
    })

    const plaintext = await eqlClient.decrypt(ciphertext, {
      lockContext,
    })

    expect(plaintext).toEqual('plaintext')
  }, 30000)

  it('should encrypt with context and be unable to decrypt without context', async () => {
    const eqlClient = await eql()

    const lc = new LockContext(eqlClient, {
      identityClaim: ['sub'],
    })

    const lockContext = await lc.identify('test', {
      fetchFromCts: false,
    })

    const ciphertext = await eqlClient.encrypt('plaintext', {
      column: 'column_name',
      table: 'users',
      lockContext: lockContext,
    })

    try {
      await eqlClient.decrypt(ciphertext)
    } catch (error) {
      const e = error as Error
      expect(e.message.startsWith('Failed to retrieve key')).toEqual(true)
    }
  }, 30000)
})
