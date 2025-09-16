import { Injectable, type OnModuleInit } from '@nestjs/common'
import { protectClient } from './index'
import type {
  ProtectClient,
  EncryptedPayload,
  EncryptOptions,
  ProtectTable,
  ProtectTableColumn,
  Decrypted,
} from '@cipherstash/protect'

@Injectable()
export class ProtectService implements OnModuleInit {
  private client: ProtectClient | null = null

  async onModuleInit() {
    this.client = await protectClient
  }

  async getClient(): Promise<ProtectClient> {
    if (!this.client) {
      this.client = await protectClient
    }
    return this.client
  }

  async encrypt(plaintext: string, options: EncryptOptions) {
    const client = await this.getClient()
    return client.encrypt(plaintext, options)
  }

  async decrypt(encryptedPayload: EncryptedPayload) {
    const client = await this.getClient()
    return client.decrypt(encryptedPayload)
  }

  async encryptModel<T extends Record<string, unknown>>(
    model: Decrypted<T>,
    table: ProtectTable<ProtectTableColumn>,
  ) {
    const client = await this.getClient()
    return client.encryptModel<T>(model, table)
  }

  async decryptModel<T extends Record<string, unknown>>(model: T) {
    const client = await this.getClient()
    return client.decryptModel<T>(model)
  }
}
