import { configure, getConsoleSink, getFileSink } from '@logtape/logtape'
import { describe, expect, it, beforeEach } from 'bun:test'
import { createEqlPayload, getPlaintext } from '../src/index'
import type { CsEncryptedV1Schema } from '../src/cs_encrypted_v1'

await configure({
  sinks: {
    console: getConsoleSink(),
  },
  loggers: [
    {
      category: ['jseql'],
      level: 'debug',
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

    const expectedPayload: CsEncryptedV1Schema = {
      v: 1,
      s: 1,
      k: 'pt',
      p: 'test',
      i: {
        t: 'users',
        c: 'email',
      },
      q: null,
    }

    expect(result).toEqual(expectedPayload)
  })

  it('should set custom version and queryType values when provided', () => {
    const result = createEqlPayload({
      plaintext: 'test',
      table: 'users',
      column: 'email',
      version: 2,
      queryType: 'SELECT',
    })

    const expectedPayload: CsEncryptedV1Schema = {
      v: 2,
      s: 1,
      k: 'pt',
      p: 'test',
      i: {
        t: 'users',
        c: 'email',
      },
      q: 'SELECT',
    }

    expect(result).toEqual(expectedPayload)
  })

  it('should set plaintext to an empty string if undefined', () => {
    const result = createEqlPayload({
      plaintext: undefined,
      table: 'users',
      column: 'email',
    })

    expect(result.p).toBe('')
  })
})

describe('getPlaintext', () => {
  it('should return plaintext if payload has "pt" as key', () => {
    const payload: CsEncryptedV1Schema = {
      v: 1,
      s: 1,
      k: 'pt',
      p: 'test',
      i: {
        t: 'users',
        c: 'email',
      },
      q: null,
    }

    const result = getPlaintext(payload)
    expect(result).toBe('test')
  })

  it('should return undefined and log error if payload is null', () => {
    const result = getPlaintext(null)
    expect(result).toBeUndefined()
  })

  it('should return undefined and log error if key is not "pt"', () => {
    const payload: CsEncryptedV1Schema = {
      v: 1,
      s: 1,
      k: 'ct',
      c: 'ciphertext',
      i: {
        t: 'users',
        c: 'email',
      },
      q: null,
    }

    const result = getPlaintext(payload)
    expect(result).toBeUndefined()
  })
})
