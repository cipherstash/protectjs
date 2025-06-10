import { newClient } from '@cipherstash/protect-ffi'
import { withResult, type Result } from '@byteslice/result'
import { type ProtectError, ProtectErrorTypes } from '..'
import { loadWorkSpaceId } from '../../../utils/config'
import { logger } from '../../../utils/logger'
import type {
  Client,
  Decrypted,
  EncryptedPayload,
  EncryptedSearchTerm,
  EncryptOptions,
  EncryptPayload,
  SearchTerm,
} from '../types'
import { EncryptModelOperation } from './operations/encrypt-model'
import { DecryptModelOperation } from './operations/decrypt-model'
import { BulkEncryptModelsOperation } from './operations/bulk-encrypt-models'
import { BulkDecryptModelsOperation } from './operations/bulk-decrypt-models'
import { EncryptOperation } from './operations/encrypt'
import { DecryptOperation } from './operations/decrypt'
import { SearchTermsOperation } from './operations/search-terms'
import {
  type EncryptConfig,
  encryptConfigSchema,
  type ProtectTable,
  type ProtectTableColumn,
} from '../schema'

export const noClientError = () =>
  new Error(
    'The EQL client has not been initialized. Please call init() before using the client.',
  )

export class ProtectClient {
  private client: Client
  private encryptConfig: EncryptConfig | undefined
  private workspaceId: string | undefined

  constructor(workspaceCrn?: string) {
    const workspaceId = loadWorkSpaceId(workspaceCrn)
    this.workspaceId = workspaceId
  }

  async init(config: {
    encryptConfig: EncryptConfig
    workspaceCrn?: string
    accessKey?: string
    clientId?: string
    clientKey?: string
  }): Promise<Result<ProtectClient, ProtectError>> {
    return await withResult(
      async () => {
        const validated: EncryptConfig = encryptConfigSchema.parse(
          config.encryptConfig,
        )

        logger.debug(
          'Initializing the Protect.js client with the following encrypt config:',
          {
            encryptConfig: validated,
          },
        )

        const newClientConfig = JSON.stringify({
          workspace_crn: config.workspaceCrn,
          access_key: config.accessKey,
          client_id: config.clientId,
          client_key: config.clientKey,
        })

        console.log('config', validated)

        this.client = await newClient(
          JSON.stringify(validated),
          newClientConfig,
        )
        this.encryptConfig = validated

        logger.info('Successfully initialized the Protect.js client.')
        return this
      },
      (error) => ({
        type: ProtectErrorTypes.ClientInitError,
        message: error.message,
      }),
    )
  }

  /**
   * Encryption - returns a thenable object.
   * Usage:
   *    await eqlClient.encrypt(plaintext, { column, table })
   *    await eqlClient.encrypt(plaintext, { column, table }).withLockContext(lockContext)
   */
  encrypt(plaintext: EncryptPayload, opts: EncryptOptions): EncryptOperation {
    return new EncryptOperation(this.client, plaintext, opts)
  }

  /**
   * Decryption - returns a thenable object.
   * Usage:
   *    await eqlClient.decrypt(encryptedData)
   *    await eqlClient.decrypt(encryptedData).withLockContext(lockContext)
   */
  decrypt(encryptedData: EncryptedPayload): DecryptOperation {
    return new DecryptOperation(this.client, encryptedData)
  }

  /**
   * Encrypt a model with decrypted values
   * Usage:
   *    await eqlClient.encryptModel(decryptedModel, table)
   *    await eqlClient.encryptModel(decryptedModel, table).withLockContext(lockContext)
   */
  encryptModel<T extends Record<string, unknown>>(
    input: Decrypted<T>,
    table: ProtectTable<ProtectTableColumn>,
  ): EncryptModelOperation<T> {
    return new EncryptModelOperation(this.client, input, table)
  }

  /**
   * Decrypt a model with encrypted values
   * Usage:
   *    await eqlClient.decryptModel(encryptedModel)
   *    await eqlClient.decryptModel(encryptedModel).withLockContext(lockContext)
   */
  decryptModel<T extends Record<string, unknown>>(
    input: T,
  ): DecryptModelOperation<T> {
    return new DecryptModelOperation(this.client, input)
  }

  /**
   * Bulk encrypt models with decrypted values
   * Usage:
   *    await eqlClient.bulkEncryptModels(decryptedModels, table)
   *    await eqlClient.bulkEncryptModels(decryptedModels, table).withLockContext(lockContext)
   */
  bulkEncryptModels<T extends Record<string, unknown>>(
    input: Array<Decrypted<T>>,
    table: ProtectTable<ProtectTableColumn>,
  ): BulkEncryptModelsOperation<T> {
    return new BulkEncryptModelsOperation(this.client, input, table)
  }

  /**
   * Bulk decrypt models with encrypted values
   * Usage:
   *    await eqlClient.bulkDecryptModels(encryptedModels)
   *    await eqlClient.bulkDecryptModels(encryptedModels).withLockContext(lockContext)
   */
  bulkDecryptModels<T extends Record<string, unknown>>(
    input: Array<T>,
  ): BulkDecryptModelsOperation<T> {
    return new BulkDecryptModelsOperation(this.client, input)
  }

  /**
   * Create search terms to use in a query searching encrypted data
   * Usage:
   *    await eqlClient.createSearchTerms(searchTerms)
   *    await eqlClient.createSearchTerms(searchTerms).withLockContext(lockContext)
   */
  createSearchTerms(
    terms: SearchTerm[],
  ): Promise<Result<EncryptedSearchTerm[], ProtectError>> {
    return new SearchTermsOperation(this.client, terms).execute()
  }

  /** e.g., debugging or environment info */
  clientInfo() {
    return {
      workspaceId: this.workspaceId,
    }
  }
}
