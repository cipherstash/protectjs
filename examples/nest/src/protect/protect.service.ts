import type {
  Decrypted,
  EncryptOptions,
  EncryptedPayload,
  EncryptedTable,
  EncryptedTableColumn,
  EncryptionClient,
  LockContext,
} from '@cipherstash/stack'
import { Inject, Injectable } from '@nestjs/common'
import { ENCRYPTION_CLIENT } from './protect.constants'

@Injectable()
export class EncryptionService {
  constructor(
    @Inject(ENCRYPTION_CLIENT)
    private readonly client: EncryptionClient,
  ) {}

  async encrypt(plaintext: string, options: EncryptOptions) {
    return this.client.encrypt(plaintext, options)
  }

  async decrypt(encryptedPayload: EncryptedPayload) {
    return this.client.decrypt(encryptedPayload)
  }

  async encryptModel<T extends Record<string, unknown>>(
    model: Decrypted<T>,
    table: EncryptedTable<EncryptedTableColumn>,
  ) {
    return this.client.encryptModel<T>(model, table)
  }

  async decryptModel<T extends Record<string, unknown>>(model: T) {
    return this.client.decryptModel<T>(model)
  }

  async bulkEncrypt(
    plaintexts: Array<{ id?: string; plaintext: string | null }>,
    options: EncryptOptions,
  ) {
    return this.client.bulkEncrypt(plaintexts, options)
  }

  async bulkDecrypt(
    encryptedData: Array<{ id?: string; data: EncryptedPayload | null }>,
  ) {
    return this.client.bulkDecrypt(encryptedData)
  }

  async bulkEncryptModels<T extends Record<string, unknown>>(
    models: Decrypted<T>[],
    table: EncryptedTable<EncryptedTableColumn>,
  ) {
    return this.client.bulkEncryptModels<T>(models, table)
  }

  async bulkDecryptModels<T extends Record<string, unknown>>(models: T[]) {
    return this.client.bulkDecryptModels<T>(models)
  }

  // Identity-aware encryption methods
  async encryptWithLockContext(
    plaintext: string,
    options: EncryptOptions,
    lockContext: LockContext,
  ) {
    return this.client.encrypt(plaintext, options).withLockContext(lockContext)
  }

  async decryptWithLockContext(
    encryptedPayload: EncryptedPayload,
    lockContext: LockContext,
  ) {
    return this.client.decrypt(encryptedPayload).withLockContext(lockContext)
  }

  async encryptModelWithLockContext<T extends Record<string, unknown>>(
    model: Decrypted<T>,
    table: EncryptedTable<EncryptedTableColumn>,
    lockContext: LockContext,
  ) {
    return this.client
      .encryptModel<T>(model, table)
      .withLockContext(lockContext)
  }

  async decryptModelWithLockContext<T extends Record<string, unknown>>(
    model: T,
    lockContext: LockContext,
  ) {
    return this.client.decryptModel<T>(model).withLockContext(lockContext)
  }
}
