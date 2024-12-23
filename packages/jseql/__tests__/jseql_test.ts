import 'dotenv/config'
import { describe, expect, it } from '@jest/globals'

import { createEqlPayload, getPlaintext, eql, LockContext } from '../src'
import type { CsPlaintextV1Schema } from '../src/cs_plaintext_v1'
import { getLogger } from '@logtape/logtape'

// Using require because @cipherstash/jseql-ffi might not have ES modules support
const logger = getLogger(['jseql'])

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
  it('should have defined CS_CLIENT_ID and CS_CLIENT_KEY', () => {
    expect(process.env.CS_CLIENT_ID).toBeDefined()
    expect(process.env.CS_CLIENT_KEY).toBeDefined()
    expect(process.env.CS_CLIENT_ACCESS_KEY).toBeDefined()
  })

  it('should encrypt and decrypt a payload', async () => {
    console.log(process.env)
    if (
      !process.env.CS_CLIENT_ID ||
      !process.env.CS_CLIENT_KEY ||
      !process.env.CS_CLIENT_ACCESS_KEY
    ) {
      throw new Error(
        'CS_CLIENT_ID and CS_CLIENT_KEY must be set and CS_CLIENT_ACCESS_KEY must be set',
      )
    }

    const eqlClient = await eql({
      workspaceId: 'test',
      clientId: process.env.CS_CLIENT_ID,
      clientKey: process.env.CS_CLIENT_KEY,
      accessToken: process.env.CS_CLIENT_ACCESS_KEY,
    })

    const ciphertext = await eqlClient.encrypt('plaintext', {
      column: 'column_name',
      table: 'users',
    })

    const plaintext = await eqlClient.decrypt(ciphertext)

    expect(plaintext).toEqual('plaintext')
  }, 30000)

  it('should encrypt and decrypt a payload with lock context', async () => {
    if (
      !process.env.CS_CLIENT_ID ||
      !process.env.CS_CLIENT_KEY ||
      !process.env.CS_CLIENT_ACCESS_KEY
    ) {
      throw new Error(
        'CS_CLIENT_ID and CS_CLIENT_KEY must be set and CS_CLIENT_ACCESS_KEY must be set',
      )
    }

    const eqlClient = await eql({
      workspaceId: 'test',
      clientId: process.env.CS_CLIENT_ID,
      clientKey: process.env.CS_CLIENT_KEY,
      accessToken: process.env.CS_CLIENT_ACCESS_KEY,
    })

    const lc = new LockContext({
      identityClaim: ['sub'],
      workspaceId: 'test',
      region: 'ap-southeast-2',
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
    if (
      !process.env.CS_CLIENT_ID ||
      !process.env.CS_CLIENT_KEY ||
      !process.env.CS_CLIENT_ACCESS_KEY
    ) {
      throw new Error(
        'CS_CLIENT_ID and CS_CLIENT_KEY must be set and CS_CLIENT_ACCESS_KEY must be set',
      )
    }

    const eqlClient = await eql({
      workspaceId: 'test',
      clientId: process.env.CS_CLIENT_ID,
      clientKey: process.env.CS_CLIENT_KEY,
      accessToken: process.env.CS_CLIENT_ACCESS_KEY,
    })

    const lc = new LockContext({
      identityClaim: ['sub'],
      workspaceId: 'test',
      region: 'ap-southeast-2',
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
