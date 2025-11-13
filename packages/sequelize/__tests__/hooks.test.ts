import type { ProtectClient } from '@cipherstash/protect'
import { DataTypes, Op } from 'sequelize'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createEncryptedType } from '../src/data-type'
import { addProtectHooks } from '../src/hooks'

// Mock ProtectClient with input-based responses for better test isolation
const createMockProtectClient = (): ProtectClient =>
  ({
    createSearchTerms: vi.fn().mockImplementation((terms) =>
      Promise.resolve({
        data: terms.map(// biome-ignore lint/suspicious/noExplicitAny: mock term type
    (term: any) => `encrypted_${term.value}`),
        failure: null,
      }),
    ),
    bulkDecryptModels: vi.fn().mockResolvedValue({
      data: [{ email: 'test@example.com', age: 25 }],
      failure: null,
    }),
  }) as any

describe('addProtectHooks', () => {
  let ENCRYPTED: ReturnType<typeof createEncryptedType>
  let mockProtectClient: ProtectClient

  beforeEach(() => {
    ENCRYPTED = createEncryptedType()
    mockProtectClient = createMockProtectClient()
  })

  it('should install beforeFind and afterFind hooks', () => {
    const emailColumn = ENCRYPTED('email', { equality: true })

    const mockModel: any = {
      tableName: 'users',
      name: 'User',
      getAttributes: () => ({
        email: { type: emailColumn },
      }),
      options: {
        hooks: {},
      },
      addHook: vi.fn((hookName: string, // biome-ignore lint/suspicious/noExplicitAny: mock hook handler
        handler: any) => {
        if (!mockModel.options.hooks[hookName]) {
          mockModel.options.hooks[hookName] = []
        }
        mockModel.options.hooks[hookName].push(handler)
      }),
    }

    addProtectHooks(mockModel, mockProtectClient)

    // Check hooks are registered
    const hooks = mockModel.options.hooks
    expect(hooks.beforeFind).toBeDefined()
    expect(hooks.afterFind).toBeDefined()
  })
})

describe('WHERE clause transformation', () => {
  let ENCRYPTED: ReturnType<typeof createEncryptedType>
  let mockProtectClient: ProtectClient

  beforeEach(() => {
    ENCRYPTED = createEncryptedType()
    mockProtectClient = createMockProtectClient()
  })

  it('should encrypt simple equality condition', async () => {
    const emailColumn = ENCRYPTED('email', { equality: true })

    const mockModel: any = {
      tableName: 'users',
      name: 'User',
      getAttributes: () => ({
        email: { type: emailColumn },
      }),
      options: {
        hooks: {},
      },
      addHook: vi.fn((hookName: string, // biome-ignore lint/suspicious/noExplicitAny: mock hook handler
        handler: any) => {
        if (!mockModel.options.hooks[hookName]) {
          mockModel.options.hooks[hookName] = []
        }
        mockModel.options.hooks[hookName].push(handler)
      }),
    }

    addProtectHooks(mockModel, mockProtectClient)

    // Simulate beforeFind hook with simple WHERE
    const options = {
      where: { email: 'test@example.com' },
    }

    // Hook should transform WHERE clause
    await mockModel.options.hooks.beforeFind[0](options)

    expect(mockProtectClient.createSearchTerms).toHaveBeenCalled()
    // Hooks now stringify to composite type format with input-specific encryption
    expect(options.where.email).toBe('("""encrypted_test@example.com""")')
  })

  it('should encrypt Op.eq operator', async () => {
    const emailColumn = ENCRYPTED('email', { equality: true })

    const mockModel: any = {
      tableName: 'users',
      name: 'User',
      getAttributes: () => ({
        email: { type: emailColumn },
      }),
      options: {
        hooks: {},
      },
      addHook: vi.fn((hookName: string, // biome-ignore lint/suspicious/noExplicitAny: mock hook handler
        handler: any) => {
        if (!mockModel.options.hooks[hookName]) {
          mockModel.options.hooks[hookName] = []
        }
        mockModel.options.hooks[hookName].push(handler)
      }),
    }

    addProtectHooks(mockModel, mockProtectClient)

    const options = {
      where: { email: { [Op.eq]: 'test@example.com' } },
    }

    await mockModel.options.hooks.beforeFind[0](options)

    expect(mockProtectClient.createSearchTerms).toHaveBeenCalled()
    // Hooks now stringify to composite type format with input-specific encryption
    expect(options.where.email[Op.eq]).toBe(
      '("""encrypted_test@example.com""")',
    )
  })

  it('should not transform non-encrypted columns', async () => {
    const emailColumn = ENCRYPTED('email', { equality: true })

    const mockModel: any = {
      tableName: 'users',
      name: 'User',
      getAttributes: () => ({
        email: { type: emailColumn },
        name: { type: DataTypes.STRING },
      }),
      options: {
        hooks: {},
      },
      addHook: vi.fn((hookName: string, // biome-ignore lint/suspicious/noExplicitAny: mock hook handler
        handler: any) => {
        if (!mockModel.options.hooks[hookName]) {
          mockModel.options.hooks[hookName] = []
        }
        mockModel.options.hooks[hookName].push(handler)
      }),
    }

    addProtectHooks(mockModel, mockProtectClient)

    const options = {
      where: {
        email: 'test@example.com',
        name: 'John',
      },
    }

    await mockModel.options.hooks.beforeFind[0](options)

    // email should be encrypted to composite format with input-specific encryption
    expect(options.where.email).toBe('("""encrypted_test@example.com""")')
    // name should remain unchanged
    expect(options.where.name).toBe('John')
  })
})

describe('operator validation error handling', () => {
  let ENCRYPTED: ReturnType<typeof createEncryptedType>
  let mockProtectClient: ProtectClient

  beforeEach(() => {
    ENCRYPTED = createEncryptedType()
    mockProtectClient = createMockProtectClient()
  })

  const createMockModel = (attributes: any) => {
    const mockModel: any = {
      tableName: 'users',
      name: 'User',
      getAttributes: () => attributes,
      options: { hooks: {} },
      addHook: vi.fn((hookName: string, // biome-ignore lint/suspicious/noExplicitAny: mock hook handler
        handler: any) => {
        if (!mockModel.options.hooks[hookName]) {
          mockModel.options.hooks[hookName] = []
        }
        mockModel.options.hooks[hookName].push(handler)
      }),
    }
    return mockModel
  }

  it('should throw error when using Op.gt without orderAndRange index', async () => {
    const emailColumn = ENCRYPTED('email', { equality: true }) // No orderAndRange

    const mockModel = createMockModel({ email: { type: emailColumn } })
    addProtectHooks(mockModel, mockProtectClient)

    const options = {
      where: { email: { [Op.gt]: 'test@example.com' } },
    }

    await expect(
      mockModel.options.hooks.beforeFind[0](options),
    ).rejects.toThrow("Column email doesn't have orderAndRange index")
  })

  it('should throw error when using Op.gte without orderAndRange index', async () => {
    const ageColumn = ENCRYPTED('age', { equality: true }) // No orderAndRange

    const mockModel = createMockModel({ age: { type: ageColumn } })
    addProtectHooks(mockModel, mockProtectClient)

    const options = {
      where: { age: { [Op.gte]: 25 } },
    }

    await expect(
      mockModel.options.hooks.beforeFind[0](options),
    ).rejects.toThrow("Column age doesn't have orderAndRange index")
  })

  it('should throw error when using Op.between without orderAndRange index', async () => {
    const ageColumn = ENCRYPTED('age', { equality: true }) // No orderAndRange

    const mockModel = createMockModel({ age: { type: ageColumn } })
    addProtectHooks(mockModel, mockProtectClient)

    const options = {
      where: { age: { [Op.between]: [20, 30] } },
    }

    await expect(
      mockModel.options.hooks.beforeFind[0](options),
    ).rejects.toThrow("Column age doesn't have orderAndRange index")
  })

  it('should throw error when using Op.in without equality index', async () => {
    const emailColumn = ENCRYPTED('email', { freeTextSearch: true }) // No equality

    const mockModel = createMockModel({ email: { type: emailColumn } })
    addProtectHooks(mockModel, mockProtectClient)

    const options = {
      where: { email: { [Op.in]: ['test1@example.com', 'test2@example.com'] } },
    }

    await expect(
      mockModel.options.hooks.beforeFind[0](options),
    ).rejects.toThrow("Column email doesn't have equality index")
  })

  it('should throw error when using Op.iLike without freeTextSearch index', async () => {
    const bioColumn = ENCRYPTED('bio', { equality: true }) // No freeTextSearch

    const mockModel = createMockModel({ bio: { type: bioColumn } })
    addProtectHooks(mockModel, mockProtectClient)

    const options = {
      where: { bio: { [Op.iLike]: '%engineer%' } },
    }

    await expect(
      mockModel.options.hooks.beforeFind[0](options),
    ).rejects.toThrow("Column bio doesn't have freeTextSearch index")
  })

  it('should throw error when using Op.like without freeTextSearch index', async () => {
    const bioColumn = ENCRYPTED('bio', { orderAndRange: true }) // No freeTextSearch

    const mockModel = createMockModel({ bio: { type: bioColumn } })
    addProtectHooks(mockModel, mockProtectClient)

    const options = {
      where: { bio: { [Op.like]: '%developer%' } },
    }

    await expect(
      mockModel.options.hooks.beforeFind[0](options),
    ).rejects.toThrow("Column bio doesn't have freeTextSearch index")
  })
})

describe('bulk operations error handling', () => {
  let ENCRYPTED: ReturnType<typeof createEncryptedType>
  let mockProtectClient: ProtectClient

  beforeEach(() => {
    ENCRYPTED = createEncryptedType()
  })

  const createMockModel = (attributes: any) => {
    const mockModel: any = {
      tableName: 'users',
      name: 'User',
      getAttributes: () => attributes,
      options: { hooks: {} },
      addHook: vi.fn((hookName: string, // biome-ignore lint/suspicious/noExplicitAny: mock hook handler
        handler: any) => {
        if (!mockModel.options.hooks[hookName]) {
          mockModel.options.hooks[hookName] = []
        }
        mockModel.options.hooks[hookName].push(handler)
      }),
    }
    return mockModel
  }

  it('should throw error when bulkDecryptModels returns failure', async () => {
    const emailColumn = ENCRYPTED('email', { equality: true })
    const mockModel = createMockModel({ email: { type: emailColumn } })

    // Mock protectClient with decryption failure
    mockProtectClient = {
      createSearchTerms: vi.fn().mockResolvedValue({
        data: ['encrypted_value'],
        failure: null,
      }),
      bulkDecryptModels: vi.fn().mockResolvedValue({
        data: [],
        failure: { message: 'Invalid ciphertext format' },
      }),
    // biome-ignore lint/suspicious/noExplicitAny: mock Protect client
} as any

    addProtectHooks(mockModel, mockProtectClient)

    // Create mock result with encrypted data
    const mockResults = [
      {
        get: vi.fn().mockReturnValue({
          id: 1,
          email: '("""encrypted_data""")',
        }),
        set: vi.fn(),
      },
    ]

    // afterFind hook should throw when decryption fails
    await expect(
      mockModel.options.hooks.afterFind[0](mockResults),
    ).rejects.toThrow('Decryption failed: Invalid ciphertext format')
  })

  it('should throw error when encryption fails in beforeSave', async () => {
    const emailColumn = ENCRYPTED('email', { equality: true })
    const mockModel = createMockModel({ email: { type: emailColumn } })

    // Mock protectClient with encryption failure
    mockProtectClient = {
      encrypt: vi.fn().mockResolvedValue({
        data: null,
        failure: { message: 'Encryption service unavailable' },
      }),
      createSearchTerms: vi.fn(),
      bulkDecryptModels: vi.fn(),
    // biome-ignore lint/suspicious/noExplicitAny: mock Protect client
} as any

    addProtectHooks(mockModel, mockProtectClient)

    // Create mock instance
    const mockInstance = {
      get: vi.fn().mockReturnValue({
        email: 'test@example.com',
      }),
      setDataValue: vi.fn(),
    }

    // beforeSave hook should throw when encryption fails
    await expect(
      mockModel.options.hooks.beforeSave[0](mockInstance),
    ).rejects.toThrow(
      'Encryption failed for email: Encryption service unavailable',
    )
  })

  it('should throw error when bulk encryption fails in beforeBulkCreate', async () => {
    const emailColumn = ENCRYPTED('email', { equality: true })
    const mockModel = createMockModel({ email: { type: emailColumn } })

    // Mock protectClient with encryption failure
    mockProtectClient = {
      encrypt: vi.fn().mockResolvedValue({
        data: null,
        failure: { message: 'Bulk encryption limit exceeded' },
      }),
      createSearchTerms: vi.fn(),
      bulkDecryptModels: vi.fn(),
    // biome-ignore lint/suspicious/noExplicitAny: mock Protect client
} as any

    addProtectHooks(mockModel, mockProtectClient)

    // Create mock instances for bulk create
    const mockInstances = [
      {
        get: vi.fn().mockReturnValue({
          email: 'user1@example.com',
        }),
        setDataValue: vi.fn(),
      },
      {
        get: vi.fn().mockReturnValue({
          email: 'user2@example.com',
        }),
        setDataValue: vi.fn(),
      },
    ]

    // beforeBulkCreate hook should throw when encryption fails
    await expect(
      mockModel.options.hooks.beforeBulkCreate[0](mockInstances),
    ).rejects.toThrow(
      'Encryption failed for email: Bulk encryption limit exceeded',
    )
  })

  it('should throw error when createSearchTerms fails in beforeFind', async () => {
    const emailColumn = ENCRYPTED('email', { equality: true })
    const mockModel = createMockModel({ email: { type: emailColumn } })

    // Mock protectClient with search terms creation failure
    mockProtectClient = {
      createSearchTerms: vi.fn().mockResolvedValue({
        data: [],
        failure: { message: 'Search index unavailable' },
      }),
      bulkDecryptModels: vi.fn(),
    // biome-ignore lint/suspicious/noExplicitAny: mock Protect client
} as any

    addProtectHooks(mockModel, mockProtectClient)

    const options = {
      where: { email: 'test@example.com' },
    }

    // beforeFind hook should throw when search terms creation fails
    await expect(
      mockModel.options.hooks.beforeFind[0](options),
    ).rejects.toThrow('Encryption failed: Search index unavailable')
  })
})
