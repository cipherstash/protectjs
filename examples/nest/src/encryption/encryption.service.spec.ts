import type { EncryptedPayload, EncryptionClient } from '@cipherstash/stack'
import { Test, type TestingModule } from '@nestjs/testing'
import { ENCRYPTION_CLIENT } from './encryption.constants'
import { EncryptionService } from './encryption.service'
import { users } from './schema'

describe('EncryptionService', () => {
  let service: EncryptionService
  let mockClient: jest.Mocked<EncryptionClient>

  const mockEncryptedPayload: EncryptedPayload = {
    c: 'mock-encrypted-data',
    h: 'mock-header',
  }

  beforeEach(async () => {
    mockClient = {
      encrypt: jest.fn(),
      decrypt: jest.fn(),
      encryptModel: jest.fn(),
      decryptModel: jest.fn(),
      bulkEncrypt: jest.fn(),
      bulkDecrypt: jest.fn(),
      bulkEncryptModels: jest.fn(),
      bulkDecryptModels: jest.fn(),
    } as jest.Mocked<EncryptionClient>

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EncryptionService,
        {
          provide: ENCRYPTION_CLIENT,
          useValue: mockClient,
        },
      ],
    }).compile()

    service = module.get<EncryptionService>(EncryptionService)
  })

  describe('encrypt', () => {
    it('should encrypt plaintext', async () => {
      const plaintext = 'test@example.com'
      const options = { table: users, column: users.email_encrypted }
      const expectedResult = { data: mockEncryptedPayload }

      mockClient.encrypt.mockResolvedValue(expectedResult)

      const result = await service.encrypt(plaintext, options)

      expect(result).toEqual(expectedResult)
      expect(mockClient.encrypt).toHaveBeenCalledWith(plaintext, options)
    })

    it('should handle encryption failure', async () => {
      const plaintext = 'test@example.com'
      const options = { table: users, column: users.email_encrypted }
      const expectedResult = {
        failure: { type: 'EncryptionError', message: 'Failed to encrypt' },
      }

      mockClient.encrypt.mockResolvedValue(expectedResult)

      const result = await service.encrypt(plaintext, options)

      expect(result).toEqual(expectedResult)
    })
  })

  describe('decrypt', () => {
    it('should decrypt encrypted payload', async () => {
      const expectedResult = { data: 'test@example.com' }

      mockClient.decrypt.mockResolvedValue(expectedResult)

      const result = await service.decrypt(mockEncryptedPayload)

      expect(result).toEqual(expectedResult)
      expect(mockClient.decrypt).toHaveBeenCalledWith(mockEncryptedPayload)
    })
  })

  describe('encryptModel', () => {
    it('should encrypt a model', async () => {
      const model = {
        id: '1',
        email_encrypted: 'test@example.com',
        name: 'John Doe',
      }
      const expectedResult = {
        data: {
          id: '1',
          email_encrypted: mockEncryptedPayload,
          name: 'John Doe',
        },
      }

      mockClient.encryptModel.mockResolvedValue(expectedResult)

      const result = await service.encryptModel(model, users)

      expect(result).toEqual(expectedResult)
      expect(mockClient.encryptModel).toHaveBeenCalledWith(model, users)
    })
  })

  describe('decryptModel', () => {
    it('should decrypt a model', async () => {
      const encryptedModel = {
        id: '1',
        email_encrypted: mockEncryptedPayload,
        name: 'John Doe',
      }
      const expectedResult = {
        data: {
          id: '1',
          email_encrypted: 'test@example.com',
          name: 'John Doe',
        },
      }

      mockClient.decryptModel.mockResolvedValue(expectedResult)

      const result = await service.decryptModel(encryptedModel)

      expect(result).toEqual(expectedResult)
      expect(mockClient.decryptModel).toHaveBeenCalledWith(encryptedModel)
    })
  })

  describe('bulkEncrypt', () => {
    it('should bulk encrypt plaintexts', async () => {
      const plaintexts = [
        { id: '1', plaintext: 'test1@example.com' },
        { id: '2', plaintext: 'test2@example.com' },
      ]
      const options = { table: users, column: users.email_encrypted }
      const expectedResult = {
        data: [
          { id: '1', data: mockEncryptedPayload },
          { id: '2', data: mockEncryptedPayload },
        ],
      }

      mockClient.bulkEncrypt.mockResolvedValue(expectedResult)

      const result = await service.bulkEncrypt(plaintexts, options)

      expect(result).toEqual(expectedResult)
      expect(mockClient.bulkEncrypt).toHaveBeenCalledWith(plaintexts, options)
    })
  })

  describe('bulkDecrypt', () => {
    it('should bulk decrypt encrypted data', async () => {
      const encryptedData = [
        { id: '1', data: mockEncryptedPayload },
        { id: '2', data: mockEncryptedPayload },
      ]
      const expectedResult = {
        data: [
          { id: '1', data: 'test1@example.com' },
          { id: '2', data: 'test2@example.com' },
        ],
      }

      mockClient.bulkDecrypt.mockResolvedValue(expectedResult)

      const result = await service.bulkDecrypt(encryptedData)

      expect(result).toEqual(expectedResult)
      expect(mockClient.bulkDecrypt).toHaveBeenCalledWith(encryptedData)
    })
  })

  describe('bulkEncryptModels', () => {
    it('should bulk encrypt models', async () => {
      const models = [
        { id: '1', email_encrypted: 'test1@example.com', name: 'User 1' },
        { id: '2', email_encrypted: 'test2@example.com', name: 'User 2' },
      ]
      const expectedResult = {
        data: [
          { id: '1', email_encrypted: mockEncryptedPayload, name: 'User 1' },
          { id: '2', email_encrypted: mockEncryptedPayload, name: 'User 2' },
        ],
      }

      mockClient.bulkEncryptModels.mockResolvedValue(expectedResult)

      const result = await service.bulkEncryptModels(models, users)

      expect(result).toEqual(expectedResult)
      expect(mockClient.bulkEncryptModels).toHaveBeenCalledWith(models, users)
    })
  })

  describe('bulkDecryptModels', () => {
    it('should bulk decrypt models', async () => {
      const encryptedModels = [
        { id: '1', email_encrypted: mockEncryptedPayload, name: 'User 1' },
        { id: '2', email_encrypted: mockEncryptedPayload, name: 'User 2' },
      ]
      const expectedResult = {
        data: [
          { id: '1', email_encrypted: 'test1@example.com', name: 'User 1' },
          { id: '2', email_encrypted: 'test2@example.com', name: 'User 2' },
        ],
      }

      mockClient.bulkDecryptModels.mockResolvedValue(expectedResult)

      const result = await service.bulkDecryptModels(encryptedModels)

      expect(result).toEqual(expectedResult)
      expect(mockClient.bulkDecryptModels).toHaveBeenCalledWith(encryptedModels)
    })
  })
})
