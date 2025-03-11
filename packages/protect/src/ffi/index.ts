import {
  decrypt as ffiDecrypt,
  decryptBulk as ffiDecryptBulk,
  encrypt as ffiEncrypt,
  encryptBulk as ffiEncryptBulk,
  newClient,
  type EncryptPayload as FFIEncryptPayload,
} from '@cipherstash/protect-ffi'
import { withResult, type Result } from '@byteslice/result'
import { type ProtectError, ProtectErrorTypes } from '..'
import { loadWorkSpaceId } from '../../../utils/config'
import { logger } from '../../../utils/logger'
import type { LockContext } from '../identify'
import type { EqlSchema } from '../eql.schema'
import {
  normalizeBulkDecryptPayloads,
  normalizeBulkDecryptPayloadsWithLockContext,
  normalizeBulkEncryptPayloads,
  normalizeBulkEncryptPayloadsWithLockContext,
} from './payload-helpers'
import {
  type EncryptConfig,
  encryptConfigSchema,
  type ProtectTable,
  type ProtectColumn,
  type ProtectTableColumn,
} from '../schema'

// ------------------------
// Type Definitions
// ------------------------
export type EncryptPayload = string | null
export type EncryptedData = EqlSchema | null

export type BulkEncryptPayload = {
  plaintext: string
  id: string
}[]

export type BulkEncryptedData =
  | {
      encryptedData: EncryptedData
      id: string
    }[]
  | null

export type BulkDecryptedData =
  | ({
      plaintext: string
      id: string
    } | null)[]
  | null

export type EncryptOptions = {
  column: ProtectColumn
  table: ProtectTable<Record<string, ProtectColumn>>
}

type Client = Awaited<ReturnType<typeof newClient>> | undefined

// ------------------------
// Reusable functions
// ------------------------
const noClientError = () =>
  new Error(
    'The EQL client has not been initialized. Please call init() before using the client.',
  )

// ------------------------
// Encrhyption operation implementations
// ------------------------
class EncryptOperation
  implements PromiseLike<Result<EncryptedData, ProtectError>>
{
  private client: Client
  private plaintext: EncryptPayload
  private column: ProtectColumn
  private table: ProtectTable<ProtectTableColumn>

  constructor(client: Client, plaintext: EncryptPayload, opts: EncryptOptions) {
    this.client = client
    this.plaintext = plaintext
    this.column = opts.column
    this.table = opts.table
  }

  public withLockContext(
    lockContext: LockContext,
  ): EncryptOperationWithLockContext {
    return new EncryptOperationWithLockContext(this, lockContext)
  }

  /** Implement the PromiseLike interface so `await` works. */
  public then<TResult1 = Result<EncryptedData, ProtectError>, TResult2 = never>(
    onfulfilled?:
      | ((
          value: Result<EncryptedData, ProtectError>,
        ) => TResult1 | PromiseLike<TResult1>)
      | null,
    // biome-ignore lint/suspicious/noExplicitAny: Rejections require an any type
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected)
  }

  /** Actual encryption logic, deferred until `then()` is called. */
  private async execute(): Promise<Result<EncryptedData, ProtectError>> {
    logger.debug('Encrypting data WITHOUT a lock context', {
      column: this.column.getName(),
      table: this.table.tableName,
    })

    return await withResult(
      async () => {
        if (!this.client) {
          throw noClientError()
        }

        if (this.plaintext === null) {
          return null
        }

        const val = await ffiEncrypt(this.client, {
          plaintext: this.plaintext,
          column: this.column.getName(),
          table: this.table.tableName,
        })

        return JSON.parse(val)
      },
      (error) => ({
        type: ProtectErrorTypes.EncryptionError,
        message: error.message,
      }),
    )
  }

  public getOperation(): {
    client: Client
    plaintext: EncryptPayload
    column: ProtectColumn
    table: ProtectTable<ProtectTableColumn>
  } {
    return {
      client: this.client,
      plaintext: this.plaintext,
      column: this.column,
      table: this.table,
    }
  }
}

class EncryptOperationWithLockContext
  implements PromiseLike<Result<EncryptedData, ProtectError>>
{
  private operation: EncryptOperation
  private lockContext: LockContext

  constructor(operation: EncryptOperation, lockContext: LockContext) {
    this.operation = operation
    this.lockContext = lockContext
  }

  public then<TResult1 = Result<EncryptedData, ProtectError>, TResult2 = never>(
    onfulfilled?:
      | ((
          value: Result<EncryptedData, ProtectError>,
        ) => TResult1 | PromiseLike<TResult1>)
      | null,
    // biome-ignore lint/suspicious/noExplicitAny: Rejections require an any type
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected)
  }

  private async execute(): Promise<Result<EncryptedData, ProtectError>> {
    return await withResult(
      async () => {
        const { client, plaintext, column, table } =
          this.operation.getOperation()

        logger.debug('Encrypting data WITH a lock context', {
          column: column,
          table: table,
        })

        if (!client) {
          throw noClientError()
        }

        if (plaintext === null) {
          return null
        }

        const context = await this.lockContext.getLockContext()

        if (context.failure) {
          throw new Error(`[protect]: ${context.failure.message}`)
        }

        const val = await ffiEncrypt(
          client,
          {
            plaintext: plaintext,
            column: column.getName(),
            table: table.tableName,
            lockContext: context.data.context,
          },
          context.data.ctsToken,
        )

        return JSON.parse(val)
      },
      (error) => ({
        type: ProtectErrorTypes.EncryptionError,
        message: error.message,
      }),
    )
  }
}

// ------------------------
// Decryption operation implementations
// ------------------------
class DecryptOperation
  implements PromiseLike<Result<string | null, ProtectError>>
{
  private client: Client
  private encryptedData: EncryptedData

  constructor(client: Client, encryptedData: EncryptedData) {
    this.client = client
    this.encryptedData = encryptedData
  }

  public withLockContext(
    lockContext: LockContext,
  ): DecryptOperationWithLockContext {
    return new DecryptOperationWithLockContext(this, lockContext)
  }

  public then<TResult1 = Result<string | null, ProtectError>, TResult2 = never>(
    onfulfilled?:
      | ((
          value: Result<string | null, ProtectError>,
        ) => TResult1 | PromiseLike<TResult1>)
      | null,
    // biome-ignore lint/suspicious/noExplicitAny: Rejections require an any type
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected)
  }

  private async execute(): Promise<Result<string | null, ProtectError>> {
    return await withResult(
      async () => {
        if (!this.client) {
          throw noClientError()
        }

        if (this.encryptedData === null) {
          return null
        }

        if (this.encryptedData.k !== 'ct') {
          throw new Error(
            'The encrypted data is not compliant with the EQL schema',
          )
        }

        logger.debug('Decrypting data WITHOUT a lock context')
        return await ffiDecrypt(this.client, this.encryptedData.c)
      },
      (error) => ({
        type: ProtectErrorTypes.DecryptionError,
        message: error.message,
      }),
    )
  }

  public getOperation(): {
    client: Client
    encryptedData: EncryptedData
  } {
    return {
      client: this.client,
      encryptedData: this.encryptedData,
    }
  }
}

class DecryptOperationWithLockContext
  implements PromiseLike<Result<string | null, ProtectError>>
{
  private operation: DecryptOperation
  private lockContext: LockContext

  constructor(operation: DecryptOperation, lockContext: LockContext) {
    this.operation = operation
    this.lockContext = lockContext
  }

  public then<TResult1 = Result<string | null, ProtectError>, TResult2 = never>(
    onfulfilled?:
      | ((
          value: Result<string | null, ProtectError>,
        ) => TResult1 | PromiseLike<TResult1>)
      | null,
    // biome-ignore lint/suspicious/noExplicitAny: Rejections require an any type
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected)
  }

  private async execute(): Promise<Result<string | null, ProtectError>> {
    return await withResult(
      async () => {
        const { client, encryptedData } = this.operation.getOperation()

        if (!client) {
          throw noClientError()
        }

        if (encryptedData === null) {
          return null
        }

        logger.debug('Decrypting data WITH a lock context')

        const context = await this.lockContext.getLockContext()

        if (context.failure) {
          throw new Error(`[protect]: ${context.failure.message}`)
        }

        if (encryptedData.k !== 'ct') {
          throw new Error(
            'The encrypted data is not compliant with the EQL schema',
          )
        }

        return await ffiDecrypt(
          client,
          encryptedData.c,
          context.data.context,
          context.data.ctsToken,
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
// Bulk Encryption operation implementations
// ------------------------
class BulkEncryptOperation
  implements PromiseLike<Result<BulkEncryptedData, ProtectError>>
{
  private client: Client
  private plaintexts: BulkEncryptPayload
  private column: ProtectColumn
  private table: ProtectTable<ProtectTableColumn>

  constructor(
    client: Client,
    plaintexts: BulkEncryptPayload,
    opts: EncryptOptions,
  ) {
    this.client = client
    this.plaintexts = plaintexts
    this.column = opts.column
    this.table = opts.table
  }

  public withLockContext(
    lockContext: LockContext,
  ): BulkEncryptOperationWithLockContext {
    return new BulkEncryptOperationWithLockContext(this, lockContext)
  }

  public then<
    TResult1 = Result<BulkEncryptedData, ProtectError>,
    TResult2 = never,
  >(
    onfulfilled?:
      | ((
          value: Result<BulkEncryptedData, ProtectError>,
        ) => TResult1 | PromiseLike<TResult1>)
      | null,
    // biome-ignore lint/suspicious/noExplicitAny: Rejections require an any type
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected)
  }

  private async execute(): Promise<Result<BulkEncryptedData, ProtectError>> {
    return await withResult(
      async () => {
        if (!this.client) {
          throw noClientError()
        }

        if (!this.plaintexts || this.plaintexts.length === 0) {
          return null
        }

        const encryptPayloads = normalizeBulkEncryptPayloads(
          this.plaintexts,
          this.column.getName(),
          this.table.tableName,
        )

        logger.debug('Bulk encrypting data WITHOUT a lock context', {
          column: this.column.getName(),
          table: this.table.tableName,
        })

        const encryptedData = await ffiEncryptBulk(this.client, encryptPayloads)
        return encryptedData.map((enc, index) => ({
          encryptedData: JSON.parse(enc),
          id: this.plaintexts[index].id,
        }))
      },
      (error) => ({
        type: ProtectErrorTypes.EncryptionError,
        message: error.message,
      }),
    )
  }

  public getOperation(): {
    client: Client
    plaintexts: BulkEncryptPayload
    column: ProtectColumn
    table: ProtectTable<ProtectTableColumn>
  } {
    return {
      client: this.client,
      plaintexts: this.plaintexts,
      column: this.column,
      table: this.table,
    }
  }
}

class BulkEncryptOperationWithLockContext
  implements PromiseLike<Result<BulkEncryptedData, ProtectError>>
{
  private operation: BulkEncryptOperation
  private lockContext: LockContext

  constructor(operation: BulkEncryptOperation, lockContext: LockContext) {
    this.operation = operation
    this.lockContext = lockContext
  }

  public then<
    TResult1 = Result<BulkEncryptedData, ProtectError>,
    TResult2 = never,
  >(
    onfulfilled?:
      | ((
          value: Result<BulkEncryptedData, ProtectError>,
        ) => TResult1 | PromiseLike<TResult1>)
      | null,
    // biome-ignore lint/suspicious/noExplicitAny: Rejections require an any type
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected)
  }

  private async execute(): Promise<Result<BulkEncryptedData, ProtectError>> {
    return await withResult(
      async () => {
        const { client, plaintexts, column, table } =
          this.operation.getOperation()

        if (!client) {
          throw noClientError()
        }

        if (!plaintexts || plaintexts.length === 0) {
          return null
        }

        const encryptPayloads =
          await normalizeBulkEncryptPayloadsWithLockContext(
            plaintexts,
            column.getName(),
            table.tableName,
            this.lockContext,
          )

        if (encryptPayloads.failure) {
          throw new Error(`[protect]: ${encryptPayloads.failure.message}`)
        }

        logger.debug('Bulk encrypting data WITH a lock context', {
          column,
          table,
        })

        const context = await this.lockContext.getLockContext()

        if (context.failure) {
          throw new Error(`[protect]: ${context.failure.message}`)
        }

        const encryptedData = await ffiEncryptBulk(
          client,
          encryptPayloads.data,
          context.data.ctsToken,
        )

        return encryptedData.map((enc, index) => ({
          encryptedData: JSON.parse(enc),
          id: plaintexts[index].id,
        }))
      },
      (error) => ({
        type: ProtectErrorTypes.EncryptionError,
        message: error.message,
      }),
    )
  }
}

// ------------------------
// Bulk Decryption operation implementations
// ------------------------
class BulkDecryptOperation
  implements PromiseLike<Result<BulkDecryptedData, ProtectError>>
{
  private client: Client
  private encryptedDatas: BulkEncryptedData

  constructor(client: Client, encryptedDatas: BulkEncryptedData) {
    this.client = client
    this.encryptedDatas = encryptedDatas
  }

  public withLockContext(
    lockContext: LockContext,
  ): BulkDecryptOperationWithLockContext {
    return new BulkDecryptOperationWithLockContext(this, lockContext)
  }

  public then<
    TResult1 = Result<BulkDecryptedData, ProtectError>,
    TResult2 = never,
  >(
    onfulfilled?:
      | ((
          value: Result<BulkDecryptedData, ProtectError>,
        ) => TResult1 | PromiseLike<TResult1>)
      | null,
    // biome-ignore lint/suspicious/noExplicitAny: Rejections require an any type
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected)
  }

  private async execute(): Promise<Result<BulkDecryptedData, ProtectError>> {
    return await withResult(
      async () => {
        if (!this.client) {
          throw noClientError()
        }

        if (!this.encryptedDatas) {
          return null
        }

        const decryptPayloads = normalizeBulkDecryptPayloads(
          this.encryptedDatas,
        )

        if (!decryptPayloads) {
          return null
        }

        logger.debug('Bulk decrypting data WITHOUT a lock context')

        const decryptedData = await ffiDecryptBulk(this.client, decryptPayloads)
        return decryptedData.map((dec, index) => {
          if (!this.encryptedDatas) return null
          return {
            plaintext: dec,
            id: this.encryptedDatas[index].id,
          }
        })
      },
      (error) => ({
        type: ProtectErrorTypes.DecryptionError,
        message: error.message,
      }),
    )
  }

  public getOperation(): {
    client: Client
    encryptedDatas: BulkEncryptedData
  } {
    return {
      client: this.client,
      encryptedDatas: this.encryptedDatas,
    }
  }
}

class BulkDecryptOperationWithLockContext
  implements PromiseLike<Result<BulkDecryptedData, ProtectError>>
{
  private operation: BulkDecryptOperation
  private lockContext: LockContext

  constructor(operation: BulkDecryptOperation, lockContext: LockContext) {
    this.operation = operation
    this.lockContext = lockContext
  }

  public then<
    TResult1 = Result<BulkDecryptedData, ProtectError>,
    TResult2 = never,
  >(
    onfulfilled?:
      | ((
          value: Result<BulkDecryptedData, ProtectError>,
        ) => TResult1 | PromiseLike<TResult1>)
      | null,
    // biome-ignore lint/suspicious/noExplicitAny: Rejections require an any type
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected)
  }

  private async execute(): Promise<Result<BulkDecryptedData, ProtectError>> {
    return await withResult(
      async () => {
        const { client, encryptedDatas } = this.operation.getOperation()

        if (!client) {
          throw noClientError()
        }

        if (!encryptedDatas) {
          return null
        }

        const decryptPayloads =
          await normalizeBulkDecryptPayloadsWithLockContext(
            encryptedDatas,
            this.lockContext,
          )

        if (decryptPayloads.failure) {
          throw new Error(`[protect]: ${decryptPayloads.failure.message}`)
        }

        if (!decryptPayloads.data) {
          return null
        }

        logger.debug('Bulk decrypting data WITH a lock context')

        const context = await this.lockContext.getLockContext()

        if (context.failure) {
          throw new Error(`[protect]: ${context.failure.message}`)
        }

        const decryptedData = await ffiDecryptBulk(
          client,
          decryptPayloads.data,
          context.data.ctsToken,
        )

        return decryptedData.map((dec, index) => {
          if (!encryptedDatas) return null
          return {
            plaintext: dec,
            id: encryptedDatas[index].id,
          }
        })
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
  decrypt(encryptedData: EncryptedData): DecryptOperation {
    return new DecryptOperation(this.client, encryptedData)
  }

  /**
   * Bulk Encrypt - returns a thenable object.
   * Usage:
   *    await eqlClient.bulkEncrypt([{ plaintext, id }, ...], { column, table })
   *    await eqlClient
   *      .bulkEncrypt([{ plaintext, id }, ...], { column, table })
   *      .withLockContext(lockContext)
   */
  bulkEncrypt(
    plaintexts: BulkEncryptPayload,
    opts: EncryptOptions,
  ): BulkEncryptOperation {
    return new BulkEncryptOperation(this.client, plaintexts, opts)
  }

  /**
   * Bulk Decrypt - returns a thenable object.
   * Usage:
   *    await eqlClient.bulkDecrypt(encryptedDatas)
   *    await eqlClient.bulkDecrypt(encryptedDatas).withLockContext(lockContext)
   */
  bulkDecrypt(encryptedDatas: BulkEncryptedData): BulkDecryptOperation {
    return new BulkDecryptOperation(this.client, encryptedDatas)
  }

  /** e.g., debugging or environment info */
  clientInfo() {
    return {
      workspaceId: this.workspaceId,
    }
  }
}
