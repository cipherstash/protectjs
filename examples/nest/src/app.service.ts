import type { Decrypted, EncryptedPayload } from '@cipherstash/protect'
import { Injectable } from '@nestjs/common'
import type { ProtectService } from './protect'
import { users } from './protect'

export type User = {
  id: string
  email_encrypted: EncryptedPayload | string
  phone_encrypted?: EncryptedPayload | string
  ssn_encrypted?: EncryptedPayload | string
  name: string
}

export type CreateUserDto = {
  email: string
  phone?: string
  ssn?: string
  name: string
}

@Injectable()
export class AppService {
  constructor(private readonly protectService: ProtectService) {}

  async getHello(): Promise<{
    encryptedUser: User
    decryptedUser: Decrypted<User>
    bulkExample: {
      encrypted: User[]
      decrypted: Decrypted<User>[]
    }
  }> {
    // Example 1: Single model encryption/decryption
    const userData: CreateUserDto = {
      email: 'john.doe@example.com',
      phone: '+1-555-123-4567',
      ssn: '123-45-6789',
      name: 'John Doe',
    }

    const encryptedResult = await this.protectService.encryptModel<User>(
      {
        id: '1',
        email_encrypted: userData.email,
        phone_encrypted: userData.phone,
        ssn_encrypted: userData.ssn,
        name: userData.name,
      },
      users,
    )

    if (encryptedResult.failure) {
      throw new Error(`Encryption failed: ${encryptedResult.failure.message}`)
    }

    const decryptedResult = await this.protectService.decryptModel<User>(
      encryptedResult.data,
    )

    if (decryptedResult.failure) {
      throw new Error(`Decryption failed: ${decryptedResult.failure.message}`)
    }

    // Example 2: Bulk operations for better performance
    const bulkUsers: CreateUserDto[] = [
      {
        email: 'alice@example.com',
        phone: '+1-555-111-1111',
        name: 'Alice Smith',
      },
      {
        email: 'bob@example.com',
        phone: '+1-555-222-2222',
        name: 'Bob Johnson',
      },
    ]

    const bulkEncryptedResult =
      await this.protectService.bulkEncryptModels<User>(
        bulkUsers.map((user, index) => ({
          id: (index + 2).toString(),
          email_encrypted: user.email,
          phone_encrypted: user.phone,
          name: user.name,
        })),
        users,
      )

    if (bulkEncryptedResult.failure) {
      throw new Error(
        `Bulk encryption failed: ${bulkEncryptedResult.failure.message}`,
      )
    }

    const bulkDecryptedResult =
      await this.protectService.bulkDecryptModels<User>(
        bulkEncryptedResult.data,
      )

    if (bulkDecryptedResult.failure) {
      throw new Error(
        `Bulk decryption failed: ${bulkDecryptedResult.failure.message}`,
      )
    }

    return {
      encryptedUser: encryptedResult.data,
      decryptedUser: decryptedResult.data,
      bulkExample: {
        encrypted: bulkEncryptedResult.data,
        decrypted: bulkDecryptedResult.data,
      },
    }
  }

  async createUser(userData: CreateUserDto): Promise<User> {
    const encryptedResult = await this.protectService.encryptModel<User>(
      {
        id: Date.now().toString(),
        email_encrypted: userData.email,
        phone_encrypted: userData.phone,
        ssn_encrypted: userData.ssn,
        name: userData.name,
      },
      users,
    )

    if (encryptedResult.failure) {
      throw new Error(
        `User creation failed: ${encryptedResult.failure.message}`,
      )
    }

    return encryptedResult.data
  }

  async getUser(id: string, encryptedUser: User): Promise<Decrypted<User>> {
    const decryptedResult =
      await this.protectService.decryptModel<User>(encryptedUser)

    if (decryptedResult.failure) {
      throw new Error(
        `User retrieval failed: ${decryptedResult.failure.message}`,
      )
    }

    return decryptedResult.data
  }
}
