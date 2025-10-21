import { type Result, withResult } from '@byteslice/result'
import { type JsPlaintext, newClient } from '@cipherstash/protect-ffi'
import {
  type EncryptConfig,
  type ProtectTable,
  type ProtectTableColumn,
  encryptConfigSchema,
} from '@cipherstash/schema'
import { type ProtectError, ProtectErrorTypes } from '..'
import { loadWorkSpaceId } from '../../../utils/config'
import { logger } from '../../../utils/logger'
import type {
  BulkDecryptPayload,
  BulkEncryptPayload,
  Client,
  Decrypted,
  EncryptOptions,
  Encrypted,
  SearchTerm,
} from '../types'
import { BulkDecryptOperation } from './operations/bulk-decrypt'
import { BulkDecryptModelsOperation } from './operations/bulk-decrypt-models'
import { BulkEncryptOperation } from './operations/bulk-encrypt'
import { BulkEncryptModelsOperation } from './operations/bulk-encrypt-models'
import { DecryptOperation } from './operations/decrypt'
import { DecryptModelOperation } from './operations/decrypt-model'
import { EncryptOperation } from './operations/encrypt'
import { EncryptModelOperation } from './operations/encrypt-model'
import { SearchTermsOperation } from './operations/search-terms'

export const noClientError = () =>
  new Error(
    'The EQL client has not been initialized. Please call init() before using the client.',
  )

export class ProtectClient<C extends EncryptConfig = EncryptConfig> {
  private client: Client
  private encryptConfig: C | undefined
  private workspaceId: string | undefined

  constructor(workspaceCrn?: string) {
    const workspaceId = loadWorkSpaceId(workspaceCrn)
    this.workspaceId = workspaceId
  }

  async init(config: {
    encryptConfig: C
    workspaceCrn?: string
    accessKey?: string
    clientId?: string
    clientKey?: string
  }): Promise<Result<ProtectClient<C>, ProtectError>> {
    return await withResult(
      async () => {
        const validated: C = encryptConfigSchema.parse(
          config.encryptConfig,
        ) as C

        logger.debug(
          'Initializing the Protect.js client with the following encrypt config:',
          {
            encryptConfig: validated,
          },
        )

        this.client = await newClient({
          encryptConfig: validated,
          clientOpts: {
            workspaceCrn: config.workspaceCrn,
            accessKey: config.accessKey,
            clientId: config.clientId,
            clientKey: config.clientKey,
          },
        })

        this.encryptConfig = validated

        logger.info('Successfully initialized the Protect.js client.')
        return this
      },
      (error: unknown) => ({
        type: ProtectErrorTypes.ClientInitError,
        message: (error as Error).message,
      }),
    )
  }

  /**
   * Encryption - returns a thenable object.
   * Usage:
   *    await eqlClient.encrypt(plaintext, { column, table })
   *    await eqlClient.encrypt(plaintext, { column, table }).withLockContext(lockContext)
   */
  encrypt(
    plaintext: JsPlaintext | null,
    opts: EncryptOptions,
  ): EncryptOperation<C> {
    return new EncryptOperation<C>(this.client, plaintext, opts)
  }

  /**
   * Decryption - returns a thenable object.
   * Usage:
   *    await eqlClient.decrypt(encryptedData)
   *    await eqlClient.decrypt(encryptedData).withLockContext(lockContext)
   */
  decrypt(encryptedData: Encrypted<C>): DecryptOperation<C> {
    return new DecryptOperation<C>(this.client, encryptedData)
  }

  /**
   * Encrypt a model with decrypted values
   * Usage:
   *    await eqlClient.encryptModel(decryptedModel, table)
   *    await eqlClient.encryptModel(decryptedModel, table).withLockContext(lockContext)
   */
  encryptModel<T extends Record<string, unknown>>(
    input: Decrypted<T, C>,
    table: ProtectTable<ProtectTableColumn>,
  ): EncryptModelOperation<T, C> {
    return new EncryptModelOperation<T, C>(this.client, input, table)
  }

  /**
   * Decrypt a model with encrypted values
   * Usage:
   *    await eqlClient.decryptModel(encryptedModel)
   *    await eqlClient.decryptModel(encryptedModel).withLockContext(lockContext)
   */
  decryptModel<T extends Record<string, unknown>>(
    input: T,
  ): DecryptModelOperation<T, C> {
    return new DecryptModelOperation<T, C>(this.client, input)
  }

  /**
   * Bulk encrypt models with decrypted values
   * Usage:
   *    await eqlClient.bulkEncryptModels(decryptedModels, table)
   *    await eqlClient.bulkEncryptModels(decryptedModels, table).withLockContext(lockContext)
   */
  bulkEncryptModels<T extends Record<string, unknown>>(
    input: Array<Decrypted<T, C>>,
    table: ProtectTable<ProtectTableColumn>,
  ): BulkEncryptModelsOperation<T, C> {
    return new BulkEncryptModelsOperation<T, C>(this.client, input, table)
  }

  /**
   * Bulk decrypt models with encrypted values
   * Usage:
   *    await eqlClient.bulkDecryptModels(encryptedModels)
   *    await eqlClient.bulkDecryptModels(encryptedModels).withLockContext(lockContext)
   */
  bulkDecryptModels<T extends Record<string, unknown>>(
    input: Array<T>,
  ): BulkDecryptModelsOperation<T, C> {
    return new BulkDecryptModelsOperation<T, C>(this.client, input)
  }

  /**
   * Bulk encryption - returns a thenable object.
   * Usage:
   *    await eqlClient.bulkEncrypt(plaintexts, { column, table })
   *    await eqlClient.bulkEncrypt(plaintexts, { column, table }).withLockContext(lockContext)
   */
  bulkEncrypt(
    plaintexts: BulkEncryptPayload,
    opts: EncryptOptions,
  ): BulkEncryptOperation<C> {
    return new BulkEncryptOperation<C>(this.client, plaintexts, opts)
  }

  /**
   * Bulk decryption - returns a thenable object.
   * Usage:
   *    await eqlClient.bulkDecrypt(encryptedPayloads)
   *    await eqlClient.bulkDecrypt(encryptedPayloads).withLockContext(lockContext)
   */
  bulkDecrypt(
    encryptedPayloads: BulkDecryptPayload<C>,
  ): BulkDecryptOperation<C> {
    return new BulkDecryptOperation<C>(this.client, encryptedPayloads)
  }

  /**
   * Create search terms to use in a query searching encrypted data
   * Usage:
   *    await eqlClient.createSearchTerms(searchTerms)
   *    await eqlClient.createSearchTerms(searchTerms).withLockContext(lockContext)
   */
  createSearchTerms(terms: SearchTerm[]): SearchTermsOperation<C> {
    return new SearchTermsOperation<C>(this.client, terms)
  }

  /** e.g., debugging or environment info */
  clientInfo() {
    return {
      workspaceId: this.workspaceId,
    }
  }
}
