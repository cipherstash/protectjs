import { newClient } from '@cipherstash/protect-ffi'
import { withResult, type Result } from '@byteslice/result'
import { type ProtectError, ProtectErrorTypes } from '..'
import { loadWorkSpaceId } from '../../../utils/config'
import { logger } from '../../../utils/logger'
import type { LockContext } from '../identify'
import type { Client, Decrypted } from '../types'
import {
  bulkDecryptModels,
  bulkDecryptModelsWithLockContext,
  bulkEncryptModels,
  bulkEncryptModelsWithLockContext,
  decryptModelFields,
  decryptModelFieldsWithLockContext,
  encryptModelFields,
  encryptModelFieldsWithLockContext,
} from './model-helpers'
import {
  type EncryptConfig,
  encryptConfigSchema,
  type ProtectTable,
  type ProtectTableColumn,
} from '../schema'

// ------------------------
// Reusable functions
// ------------------------
const noClientError = () =>
  new Error(
    'The EQL client has not been initialized. Please call init() before using the client.',
  )

// ------------------------
// Model Encryption operation implementations
// ------------------------
class EncryptModelOperation<T extends Record<string, unknown>>
  implements PromiseLike<Result<T, ProtectError>>
{
  private client: Client
  private model: Decrypted<T>
  private table: ProtectTable<ProtectTableColumn>

  constructor(
    client: Client,
    model: Decrypted<T>,
    table: ProtectTable<ProtectTableColumn>,
  ) {
    this.client = client
    this.model = model
    this.table = table
  }

  public withLockContext(
    lockContext: LockContext,
  ): EncryptModelOperationWithLockContext<T> {
    return new EncryptModelOperationWithLockContext(this, lockContext)
  }

  /** Implement the PromiseLike interface so `await` works. */
  public then<TResult1 = Result<T, ProtectError>, TResult2 = never>(
    onfulfilled?:
      | ((value: Result<T, ProtectError>) => TResult1 | PromiseLike<TResult1>)
      | null,
    // biome-ignore lint/suspicious/noExplicitAny: Rejections require an any type
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected)
  }

  /** Actual encryption logic, deferred until `then()` is called. */
  private async execute(): Promise<Result<T, ProtectError>> {
    logger.debug('Encrypting model WITHOUT a lock context', {
      table: this.table.tableName,
    })

    return await withResult(
      async () => {
        if (!this.client) {
          throw noClientError()
        }

        return await encryptModelFields<T>(this.model, this.table, this.client)
      },
      (error) => ({
        type: ProtectErrorTypes.EncryptionError,
        message: error.message,
      }),
    )
  }

  public getOperation(): {
    client: Client
    model: Decrypted<T>
    table: ProtectTable<ProtectTableColumn>
  } {
    return {
      client: this.client,
      model: this.model,
      table: this.table,
    }
  }
}

class EncryptModelOperationWithLockContext<T extends Record<string, unknown>>
  implements PromiseLike<Result<T, ProtectError>>
{
  private operation: EncryptModelOperation<T>
  private lockContext: LockContext

  constructor(operation: EncryptModelOperation<T>, lockContext: LockContext) {
    this.operation = operation
    this.lockContext = lockContext
  }

  public then<TResult1 = Result<T, ProtectError>, TResult2 = never>(
    onfulfilled?:
      | ((value: Result<T, ProtectError>) => TResult1 | PromiseLike<TResult1>)
      | null,
    // biome-ignore lint/suspicious/noExplicitAny: Rejections require an any type
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected)
  }

  private async execute(): Promise<Result<T, ProtectError>> {
    return await withResult(
      async () => {
        const { client, model, table } = this.operation.getOperation()

        logger.debug('Encrypting model WITH a lock context', {
          table: table.tableName,
        })

        if (!client) {
          throw noClientError()
        }

        const context = await this.lockContext.getLockContext()

        if (context.failure) {
          throw new Error(`[protect]: ${context.failure.message}`)
        }

        return await encryptModelFieldsWithLockContext<T>(
          model,
          table,
          client,
          context.data,
        )
      },
      (error) => ({
        type: ProtectErrorTypes.EncryptionError,
        message: error.message,
      }),
    )
  }
}

// ------------------------
// Model Decryption operation implementations
// ------------------------
class DecryptModelOperation<T extends Record<string, unknown>>
  implements PromiseLike<Result<Decrypted<T>, ProtectError>>
{
  private client: Client
  private model: T

  constructor(client: Client, model: T) {
    this.client = client
    this.model = model
  }

  public withLockContext(
    lockContext: LockContext,
  ): DecryptModelOperationWithLockContext<T> {
    return new DecryptModelOperationWithLockContext(this, lockContext)
  }

  public then<TResult1 = Result<Decrypted<T>, ProtectError>, TResult2 = never>(
    onfulfilled?:
      | ((
          value: Result<Decrypted<T>, ProtectError>,
        ) => TResult1 | PromiseLike<TResult1>)
      | null,
    // biome-ignore lint/suspicious/noExplicitAny: Rejections require an any type
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected)
  }

  private async execute(): Promise<Result<Decrypted<T>, ProtectError>> {
    logger.debug('Decrypting model WITHOUT a lock context')

    return await withResult(
      async () => {
        if (!this.client) {
          throw noClientError()
        }

        return await decryptModelFields<T>(this.model, this.client)
      },
      (error) => ({
        type: ProtectErrorTypes.DecryptionError,
        message: error.message,
      }),
    )
  }

  public getOperation(): {
    client: Client
    model: T
  } {
    return {
      client: this.client,
      model: this.model,
    }
  }
}

class DecryptModelOperationWithLockContext<T extends Record<string, unknown>>
  implements PromiseLike<Result<Decrypted<T>, ProtectError>>
{
  private operation: DecryptModelOperation<T>
  private lockContext: LockContext

  constructor(operation: DecryptModelOperation<T>, lockContext: LockContext) {
    this.operation = operation
    this.lockContext = lockContext
  }

  public then<TResult1 = Result<Decrypted<T>, ProtectError>, TResult2 = never>(
    onfulfilled?:
      | ((
          value: Result<Decrypted<T>, ProtectError>,
        ) => TResult1 | PromiseLike<TResult1>)
      | null,
    // biome-ignore lint/suspicious/noExplicitAny: Rejections require an any type
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected)
  }

  private async execute(): Promise<Result<Decrypted<T>, ProtectError>> {
    return await withResult(
      async () => {
        const { client, model } = this.operation.getOperation()

        logger.debug('Decrypting model WITH a lock context')

        if (!client) {
          throw noClientError()
        }

        const context = await this.lockContext.getLockContext()

        if (context.failure) {
          throw new Error(`[protect]: ${context.failure.message}`)
        }

        return await decryptModelFieldsWithLockContext<T>(
          model,
          client,
          context.data,
        )
      },
      (error) => ({
        type: ProtectErrorTypes.DecryptionError,
        message: error.message,
      }),
    )
  }
}

// ------------------------
// Bulk Model Encryption operation implementations
// ------------------------
class BulkEncryptModelsOperation<T extends Record<string, unknown>>
  implements PromiseLike<Result<Array<T>, ProtectError>>
{
  private client: Client
  private models: Array<Decrypted<T>>
  private table: ProtectTable<ProtectTableColumn>

  constructor(
    client: Client,
    models: Array<Decrypted<T>>,
    table: ProtectTable<ProtectTableColumn>,
  ) {
    this.client = client
    this.models = models
    this.table = table
  }

  public withLockContext(
    lockContext: LockContext,
  ): BulkEncryptModelsOperationWithLockContext<T> {
    return new BulkEncryptModelsOperationWithLockContext(this, lockContext)
  }

  public then<TResult1 = Result<Array<T>, ProtectError>, TResult2 = never>(
    onfulfilled?:
      | ((
          value: Result<Array<T>, ProtectError>,
        ) => TResult1 | PromiseLike<TResult1>)
      | null,
    // biome-ignore lint/suspicious/noExplicitAny: Rejections require an any type
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected)
  }

  private async execute(): Promise<Result<Array<T>, ProtectError>> {
    logger.debug('Bulk encrypting models WITHOUT a lock context', {
      table: this.table.tableName,
    })

    return await withResult(
      async () => {
        if (!this.client) {
          throw noClientError()
        }

        if (!this.models || this.models.length === 0) {
          return []
        }

        return await bulkEncryptModels<T>(this.models, this.table, this.client)
      },
      (error) => ({
        type: ProtectErrorTypes.EncryptionError,
        message: error.message,
      }),
    )
  }

  public getOperation(): {
    client: Client
    models: Array<Decrypted<T>>
    table: ProtectTable<ProtectTableColumn>
  } {
    return {
      client: this.client,
      models: this.models,
      table: this.table,
    }
  }
}

class BulkEncryptModelsOperationWithLockContext<
  T extends Record<string, unknown>,
> implements PromiseLike<Result<Array<T>, ProtectError>>
{
  private operation: BulkEncryptModelsOperation<T>
  private lockContext: LockContext

  constructor(
    operation: BulkEncryptModelsOperation<T>,
    lockContext: LockContext,
  ) {
    this.operation = operation
    this.lockContext = lockContext
  }

  public then<TResult1 = Result<Array<T>, ProtectError>, TResult2 = never>(
    onfulfilled?:
      | ((
          value: Result<Array<T>, ProtectError>,
        ) => TResult1 | PromiseLike<TResult1>)
      | null,
    // biome-ignore lint/suspicious/noExplicitAny: Rejections require an any type
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected)
  }

  private async execute(): Promise<Result<Array<T>, ProtectError>> {
    return await withResult(
      async () => {
        const { client, models, table } = this.operation.getOperation()

        logger.debug('Bulk encrypting models WITH a lock context', {
          table: table.tableName,
        })

        if (!client) {
          throw noClientError()
        }

        if (!models || models.length === 0) {
          return []
        }

        const context = await this.lockContext.getLockContext()

        if (context.failure) {
          throw new Error(`[protect]: ${context.failure.message}`)
        }

        return await bulkEncryptModelsWithLockContext<T>(
          models,
          table,
          client,
          context.data,
        )
      },
      (error) => ({
        type: ProtectErrorTypes.EncryptionError,
        message: error.message,
      }),
    )
  }
}

// ------------------------
// Bulk Model Decryption operation implementations
// ------------------------
class BulkDecryptModelsOperation<T extends Record<string, unknown>>
  implements PromiseLike<Result<Array<Decrypted<T>>, ProtectError>>
{
  private client: Client
  private models: Array<T>

  constructor(client: Client, models: Array<T>) {
    this.client = client
    this.models = models
  }

  public withLockContext(
    lockContext: LockContext,
  ): BulkDecryptModelsOperationWithLockContext<T> {
    return new BulkDecryptModelsOperationWithLockContext(this, lockContext)
  }

  public then<
    TResult1 = Result<Array<Decrypted<T>>, ProtectError>,
    TResult2 = never,
  >(
    onfulfilled?:
      | ((
          value: Result<Array<Decrypted<T>>, ProtectError>,
        ) => TResult1 | PromiseLike<TResult1>)
      | null,
    // biome-ignore lint/suspicious/noExplicitAny: Rejections require an any type
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected)
  }

  private async execute(): Promise<Result<Array<Decrypted<T>>, ProtectError>> {
    logger.debug('Bulk decrypting models WITHOUT a lock context')

    return await withResult(
      async () => {
        if (!this.client) {
          throw noClientError()
        }

        if (!this.models || this.models.length === 0) {
          return []
        }

        return await bulkDecryptModels<T>(this.models, this.client)
      },
      (error) => ({
        type: ProtectErrorTypes.DecryptionError,
        message: error.message,
      }),
    )
  }

  public getOperation(): {
    client: Client
    models: Array<T>
  } {
    return {
      client: this.client,
      models: this.models,
    }
  }
}

class BulkDecryptModelsOperationWithLockContext<
  T extends Record<string, unknown>,
> implements PromiseLike<Result<Array<Decrypted<T>>, ProtectError>>
{
  private operation: BulkDecryptModelsOperation<T>
  private lockContext: LockContext

  constructor(
    operation: BulkDecryptModelsOperation<T>,
    lockContext: LockContext,
  ) {
    this.operation = operation
    this.lockContext = lockContext
  }

  public then<
    TResult1 = Result<Array<Decrypted<T>>, ProtectError>,
    TResult2 = never,
  >(
    onfulfilled?:
      | ((
          value: Result<Array<Decrypted<T>>, ProtectError>,
        ) => TResult1 | PromiseLike<TResult1>)
      | null,
    // biome-ignore lint/suspicious/noExplicitAny: Rejections require an any type
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected)
  }

  private async execute(): Promise<Result<Array<Decrypted<T>>, ProtectError>> {
    return await withResult(
      async () => {
        const { client, models } = this.operation.getOperation()

        logger.debug('Bulk decrypting models WITH a lock context')

        if (!client) {
          throw noClientError()
        }

        if (!models || models.length === 0) {
          return []
        }

        const context = await this.lockContext.getLockContext()

        if (context.failure) {
          throw new Error(`[protect]: ${context.failure.message}`)
        }

        return await bulkDecryptModelsWithLockContext<T>(
          models,
          client,
          context.data,
        )
      },
      (error) => ({
        type: ProtectErrorTypes.DecryptionError,
        message: error.message,
      }),
    )
  }
}

// ------------------------
// Main EQL Client
// ------------------------
export class ProtectClient {
  private client: Client
  private encryptConfig: EncryptConfig | undefined
  private workspaceId: string | undefined

  constructor() {
    const workspaceId = loadWorkSpaceId()
    this.workspaceId = workspaceId
  }

  async init(
    encryptConifg?: EncryptConfig,
  ): Promise<Result<ProtectClient, ProtectError>> {
    return await withResult(
      async () => {
        let c: Client

        if (encryptConifg) {
          const validated: EncryptConfig =
            encryptConfigSchema.parse(encryptConifg)

          logger.debug(
            'Initializing the Protect.js client with the following encrypt config:',
            {
              encryptConfig: validated,
            },
          )

          c = await newClient(JSON.stringify(validated))
          this.encryptConfig = validated
        } else {
          logger.debug(
            'Initializing the Protect.js client with default encrypt config.',
          )

          c = await newClient()
        }

        logger.info('Successfully initialized the Protect.js client.')
        this.client = c
        return this
      },
      (error) => ({
        type: ProtectErrorTypes.ClientInitError,
        message: error.message,
      }),
    )
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

  /** e.g., debugging or environment info */
  clientInfo() {
    return {
      workspaceId: this.workspaceId,
    }
  }
}
