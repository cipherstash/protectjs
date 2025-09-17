import { Test, TestingModule } from '@nestjs/testing'
import { AppController } from './app.controller'
import { AppService, CreateUserDto, User } from './app.service'
import { ProtectService } from './protect'
import type { Decrypted, EncryptedPayload } from '@cipherstash/protect'

describe('AppController', () => {
  let appController: AppController
  let appService: AppService
  let protectService: ProtectService

  const mockEncryptedPayload: EncryptedPayload = {
    c: 'mock-encrypted-data',
    h: 'mock-header',
  }

  const mockUser: User = {
    id: '1',
    email_encrypted: mockEncryptedPayload,
    name: 'John Doe',
  }

  const mockDecryptedUser: Decrypted<User> = {
    id: '1',
    email_encrypted: 'john.doe@example.com',
    name: 'John Doe',
  }

  beforeEach(async () => {
    const mockProtectService = {
      encryptModel: jest.fn(),
      decryptModel: jest.fn(),
      bulkEncryptModels: jest.fn(),
      bulkDecryptModels: jest.fn(),
    }

    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        {
          provide: ProtectService,
          useValue: mockProtectService,
        },
      ],
    }).compile()

    appController = app.get<AppController>(AppController)
    appService = app.get<AppService>(AppService)
    protectService = app.get<ProtectService>(ProtectService)
  })

  describe('getHello', () => {
    it('should return demo data with encrypted and decrypted users', async () => {
      // Mock the service methods
      jest.spyOn(appService, 'getHello').mockResolvedValue({
        encryptedUser: mockUser,
        decryptedUser: mockDecryptedUser,
        bulkExample: {
          encrypted: [mockUser],
          decrypted: [mockDecryptedUser],
        },
      })

      const result = await appController.getHello()

      expect(result).toEqual({
        encryptedUser: mockUser,
        decryptedUser: mockDecryptedUser,
        bulkExample: {
          encrypted: [mockUser],
          decrypted: [mockDecryptedUser],
        },
      })
    })
  })

  describe('createUser', () => {
    it('should create a user with encrypted data', async () => {
      const userData: CreateUserDto = {
        email: 'test@example.com',
        name: 'Test User',
      }

      jest.spyOn(appService, 'createUser').mockResolvedValue(mockUser)

      const result = await appController.createUser(userData)

      expect(result).toEqual(mockUser)
      expect(appService.createUser).toHaveBeenCalledWith(userData)
    })
  })

  describe('getUser', () => {
    it('should get a user by id', async () => {
      const userId = '1'

      jest.spyOn(appService, 'getUser').mockResolvedValue(mockDecryptedUser)

      const result = await appController.getUser(userId, mockUser)

      expect(result).toEqual(mockDecryptedUser)
      expect(appService.getUser).toHaveBeenCalledWith(userId, mockUser)
    })
  })

  describe('getUsers', () => {
    it('should return an empty array', async () => {
      const result = await appController.getUsers()

      expect(result).toEqual([])
    })
  })
})
