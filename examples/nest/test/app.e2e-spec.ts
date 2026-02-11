import type { EncryptedPayload } from '@cipherstash/stack'
import type { INestApplication } from '@nestjs/common'
import { Test, type TestingModule } from '@nestjs/testing'
import request from 'supertest'
import { AppController } from '../src/app.controller'
import { AppService } from '../src/app.service'
import { ProtectService } from '../src/protect'

describe('AppController (e2e)', () => {
  let app: INestApplication
  let protectService: ProtectService

  const mockEncryptedPayload: EncryptedPayload = {
    c: 'mock-encrypted-data',
    h: 'mock-header',
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        {
          provide: ProtectService,
          useValue: {
            encryptModel: jest.fn().mockImplementation((model) =>
              Promise.resolve({
                data: {
                  id: model.id || '1',
                  email_encrypted: mockEncryptedPayload,
                  name: model.name || 'Default User',
                },
              }),
            ),
            decryptModel: jest.fn().mockResolvedValue({
              data: {
                id: '1',
                email_encrypted: 'john.doe@example.com',
                name: 'John Doe',
              },
            }),
            bulkEncryptModels: jest.fn().mockResolvedValue({
              data: [
                {
                  id: '2',
                  email_encrypted: mockEncryptedPayload,
                  name: 'Alice Smith',
                },
                {
                  id: '3',
                  email_encrypted: mockEncryptedPayload,
                  name: 'Bob Johnson',
                },
              ],
            }),
            bulkDecryptModels: jest.fn().mockResolvedValue({
              data: [
                {
                  id: '2',
                  email_encrypted: 'alice@example.com',
                  name: 'Alice Smith',
                },
                {
                  id: '3',
                  email_encrypted: 'bob@example.com',
                  name: 'Bob Johnson',
                },
              ],
            }),
          },
        },
      ],
    }).compile()

    app = moduleFixture.createNestApplication()
    protectService = moduleFixture.get<ProtectService>(ProtectService)
    await app.init()
  })

  afterAll(async () => {
    await app.close()
  })

  describe('/ (GET)', () => {
    it('should return demo data with encrypted and decrypted users', () => {
      return request(app.getHttpServer())
        .get('/')
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('encryptedUser')
          expect(res.body).toHaveProperty('decryptedUser')
          expect(res.body).toHaveProperty('bulkExample')
          expect(res.body.bulkExample).toHaveProperty('encrypted')
          expect(res.body.bulkExample).toHaveProperty('decrypted')
        })
    })
  })

  describe('/users (POST)', () => {
    it('should create a user with encrypted data', () => {
      const userData = {
        email: 'test@example.com',
        name: 'Test User',
      }

      return request(app.getHttpServer())
        .post('/users')
        .send(userData)
        .expect(201)
        .expect((res) => {
          expect(res.body).toHaveProperty('id')
          expect(res.body).toHaveProperty('email_encrypted')
          expect(res.body).toHaveProperty('name')
          expect(res.body.name).toBe('Test User')
        })
    })

    it('should handle invalid user data', () => {
      const invalidUserData = {
        // Missing required fields
      }

      // Since we don't have validation pipes set up, this will succeed with default values
      return request(app.getHttpServer())
        .post('/users')
        .send(invalidUserData)
        .expect(201)
        .expect((res) => {
          expect(res.body).toHaveProperty('id')
          expect(res.body).toHaveProperty('email_encrypted')
          expect(res.body).toHaveProperty('name')
        })
    })
  })

  describe('/users/:id (GET)', () => {
    it('should get a user by id', () => {
      const userId = '1'
      const encryptedUser = {
        id: '1',
        email_encrypted: mockEncryptedPayload,
        name: 'John Doe',
      }

      return request(app.getHttpServer())
        .get(`/users/${userId}`)
        .send(encryptedUser)
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('id')
          expect(res.body).toHaveProperty('email_encrypted')
          expect(res.body).toHaveProperty('name')
        })
    })
  })

  describe('/users (GET)', () => {
    it('should return an empty array', () => {
      return request(app.getHttpServer()).get('/users').expect(200).expect([])
    })
  })
})
