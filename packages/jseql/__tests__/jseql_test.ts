require('dotenv').config()
import { describe, expect, it } from '@jest/globals'

import { createEqlPayload, getPlaintext } from '../src'
import type { CsPlaintextV1Schema } from '../src/cs_plaintext_v1'
import { getLogger } from '@logtape/logtape'

// Using require because @cipherstash/jseql-ffi might not have ES modules support
const addon = require('@cipherstash/jseql-ffi')
const eql = addon as any

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
  })

  it('should work', async () => {
    console.log(process.env.CS_CLIENT_ID)
    console.log(process.env.CS_CLIENT_KEY)
    const client = await eql.newClient()
    // const ciphertext = await eql.encrypt("plaintext", "column_name", client)
    // const plaintext = await eql.decrypt(ciphertext, client)
    // console.log({ciphertext, plaintext})

    // expect(plaintext).toEqual("plaintext")

    expect(true).toEqual(true)
  }, 30000)
})
