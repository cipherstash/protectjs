import { describe, it, expect, beforeEach } from 'vitest'
import { createEncryptedType, getEncryptedColumnConfig } from '../src/data-type'

describe('createEncryptedType', () => {
  let ENCRYPTED: ReturnType<typeof createEncryptedType>

  beforeEach(() => {
    ENCRYPTED = createEncryptedType()
  })

  it('should create an ENCRYPTED data type', () => {
    const column = ENCRYPTED('email', { equality: true })
    expect(column).toBeDefined()
  })

  it('should store column config in registry', () => {
    const column = ENCRYPTED('email', { equality: true, dataType: 'string' })

    const config = getEncryptedColumnConfig(column, 'email')
    expect(config).toBeDefined()
    expect(config?.columnName).toBe('email')
    expect(config?.equality).toBe(true)
    expect(config?.dataType).toBe('string')
  })

  it('should return SQL type as eql_v2_encrypted', () => {
    const column = ENCRYPTED('email', { equality: true })
    expect(column.toSql()).toBe('eql_v2_encrypted')
  })
})

describe('composite type parsing', () => {
  let ENCRYPTED: ReturnType<typeof createEncryptedType>

  beforeEach(() => {
    ENCRYPTED = createEncryptedType()
  })

  it('should parse composite type from database', () => {
    const EncryptedType = ENCRYPTED('test', {})
    // PostgreSQL composite types use "" to escape quotes
    const result = (EncryptedType.constructor as any).parse('("{""ciphertext"":""data""}")')
    expect(result).toEqual({ ciphertext: 'data' })
  })

  it('should handle null values', () => {
    const EncryptedType = ENCRYPTED('test', {})
    const result = (EncryptedType.constructor as any).parse('')
    expect(result).toBe(null)
  })

  it('should serialize values to composite type format', () => {
    const EncryptedType = ENCRYPTED('test', {})
    const result = (EncryptedType.constructor as any).stringify({ ciphertext: 'data' })
    // PostgreSQL composite types use "" to escape quotes
    expect(result).toBe('("{""ciphertext"":""data""}")')
  })
})
