import { describe, expect, it } from 'vitest'
import { bulkFromComposite, toComposite } from '../src/composite-type'

describe('bulkFromComposite', () => {
  it('should parse composite type fields in model objects', () => {
    const encryptedData = {
      c: 'ciphertext123',
      k: 'key456',
      i: { t: 'table', c: 'column' },
      v: 2,
    }

    const compositeString = toComposite(encryptedData)

    const users = [
      { id: 1, name: 'Alice', email: compositeString },
      { id: 2, name: 'Bob', email: compositeString },
    ]

    const parsed = bulkFromComposite(users)

    expect(parsed).toHaveLength(2)
    expect(parsed[0].id).toBe(1)
    expect(parsed[0].name).toBe('Alice')
    expect(parsed[0].email).toEqual(encryptedData)
    expect(parsed[1].id).toBe(2)
    expect(parsed[1].name).toBe('Bob')
    expect(parsed[1].email).toEqual(encryptedData)
  })

  it('should handle models with multiple encrypted fields', () => {
    const emailData = {
      c: 'email_ciphertext',
      k: 'email_key',
      i: { t: 'users', c: 'email' },
      v: 2,
    }

    const phoneData = {
      c: 'phone_ciphertext',
      k: 'phone_key',
      i: { t: 'users', c: 'phone' },
      v: 2,
    }

    const users = [
      {
        id: 1,
        name: 'Alice',
        email: toComposite(emailData),
        phone: toComposite(phoneData),
      },
    ]

    const parsed = bulkFromComposite(users)

    expect(parsed[0].email).toEqual(emailData)
    expect(parsed[0].phone).toEqual(phoneData)
  })

  it('should handle nested encrypted fields', () => {
    const addressData = {
      c: 'address_ciphertext',
      k: 'address_key',
      i: { t: 'users', c: 'address' },
      v: 2,
    }

    const users = [
      {
        id: 1,
        profile: {
          name: 'Alice',
          address: toComposite(addressData),
        },
      },
    ]

    const parsed = bulkFromComposite(users)

    expect(parsed[0].profile.address).toEqual(addressData)
  })

  it('should handle Sequelize model instances with get method', () => {
    const encryptedData = {
      c: 'ciphertext123',
      k: 'key456',
      i: { t: 'users', c: 'email' },
      v: 2,
    }

    const compositeString = toComposite(encryptedData)

    // Mock Sequelize model instance
    const mockModel = {
      id: 1,
      email: compositeString,
      get: function (opts?: { plain: boolean }) {
        if (opts?.plain) {
          return { id: this.id, email: this.email }
        }
        return this
      },
    }

    const parsed = bulkFromComposite([mockModel])

    expect(parsed[0].email).toEqual(encryptedData)
  })

  it('should leave non-composite strings unchanged', () => {
    const users = [
      { id: 1, name: 'Alice', email: 'alice@example.com' },
      { id: 2, name: 'Bob', email: 'bob@example.com' },
    ]

    const parsed = bulkFromComposite(users)

    expect(parsed[0].email).toBe('alice@example.com')
    expect(parsed[1].email).toBe('bob@example.com')
  })

  it('should handle null and undefined values', () => {
    const users = [{ id: 1, name: 'Alice', email: null, phone: undefined }]

    const parsed = bulkFromComposite(users)

    expect(parsed[0].email).toBeNull()
    expect(parsed[0].phone).toBeUndefined()
  })

  it('should handle empty arrays', () => {
    const parsed = bulkFromComposite([])
    expect(parsed).toEqual([])
  })

  it('should not mutate original models', () => {
    const encryptedData = {
      c: 'ciphertext123',
      k: 'key456',
      i: { t: 'users', c: 'email' },
      v: 2,
    }

    const compositeString = toComposite(encryptedData)
    const originalUsers = [{ id: 1, email: compositeString }]

    bulkFromComposite(originalUsers)

    // Original should still have composite string
    expect(originalUsers[0].email).toBe(compositeString)
  })

  it('should handle arrays of encrypted values', () => {
    const encryptedData = {
      c: 'ciphertext123',
      k: 'key456',
      i: { t: 'users', c: 'tags' },
      v: 2,
    }

    const users = [
      {
        id: 1,
        tags: [toComposite(encryptedData), toComposite(encryptedData)],
      },
    ]

    const parsed = bulkFromComposite(users)

    expect(parsed[0].tags).toHaveLength(2)
    expect(parsed[0].tags[0]).toEqual(encryptedData)
    expect(parsed[0].tags[1]).toEqual(encryptedData)
  })
})
