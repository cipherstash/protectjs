import { Injectable } from '@nestjs/common'
// biome-ignore lint/style/useImportType: Required for NestJS
import { ProtectService } from './protect/protect.service'
import { users } from './protect/index'
import type { Decrypted, EncryptedPayload } from '@cipherstash/protect'

export type User = {
  id: string
  email_encrypted: EncryptedPayload | string
  name: string
}

@Injectable()
export class AppService {
  constructor(private readonly protectService: ProtectService) {}

  async getHello(): Promise<{
    encryptedUser: User
    decryptedUser: Decrypted<User>
  }> {
    // Example: Encrypt some data using the injected service
    const encryptedResult = await this.protectService.encryptModel<User>(
      {
        id: '1',
        email_encrypted: 'Hello World!',
        name: 'John Doe',
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
      throw new Error(`Encryption failed: ${decryptedResult.failure.message}`)
    }

    return {
      encryptedUser: encryptedResult.data,
      decryptedUser: decryptedResult.data,
    }
  }
}
