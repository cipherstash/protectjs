import {
  decrypt as ffiDecrypt,
  decryptBulk as ffiDecryptBulk,
  encrypt as ffiEncrypt,
  encryptBulk as ffiEncryptBulk,
  newClient,
} from '@cipherstash/protect-ffi'
import { withResult, type Result } from '@byteslice/result'
import { type ProtectError, ProtectErrorTypes } from '..'
import { loadWorkSpaceId } from '../../../utils/config'
import { logger } from '../../../utils/logger'
import type { LockContext } from '../identify'
import {
  normalizeBulkDecryptPayloads,
  normalizeBulkDecryptPayloadsWithLockContext,
  normalizeBulkEncryptPayloads,
  normalizeBulkEncryptPayloadsWithLockContext,
} from './payload-helpers'
import { type EncryptConfig, encryptConfigSchema } from './encrypt-config'

// ------------------------
// Type Definitions
// ------------------------
export type EncryptPayload = string | null

export type EncryptedPayload = { c: string } | null

export type BulkEncryptPayload = {
  plaintext: string
  id: string
}[]

export type BulkEncryptedData =
  | {
      c: string
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
  column: string
  table: string
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
  implements PromiseLike<Result<EncryptedPayload, ProtectError>>
{
  private client: Client
  private plaintext: EncryptPayload
  private column: string
  private table: string

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
  public then<
    TResult1 = Result<EncryptedPayload, ProtectError>,
    TResult2 = never,
  >(
    onfulfilled?:
      | ((
          value: Result<EncryptedPayload, ProtectError>,
        ) => TResult1 | PromiseLike<TResult1>)
      | null,
    // biome-ignore lint/suspicious/noExplicitAny: Rejections require an any type
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected)
  }

  /** Actual encryption logic, deferred until `then()` is called. */
  private async execute(): Promise<Result<EncryptedPayload, ProtectError>> {
    logger.debug('Encrypting data WITHOUT a lock context', {
      column: this.column,
      table: this.table,
    })

    return await withResult(
      async () => {
        if (!this.client) {
          throw noClientError()
        }

        if (this.plaintext === null) {
          return null
        }

        const val = await ffiEncrypt(
          this.client,
          this.plaintext,
          this.column,
          this.table,
        )

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
    column: string
    table: string
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
  implements PromiseLike<Result<EncryptedPayload, ProtectError>>
{
  private operation: EncryptOperation
  private lockContext: LockContext

  constructor(operation: EncryptOperation, lockContext: LockContext) {
    this.operation = operation
    this.lockContext = lockContext
  }

  public then<
    TResult1 = Result<EncryptedPayload, ProtectError>,
    TResult2 = never,
  >(
    onfulfilled?:
      | ((
          value: Result<EncryptedPayload, ProtectError>,
        ) => TResult1 | PromiseLike<TResult1>)
      | null,
    // biome-ignore lint/suspicious/noExplicitAny: Rejections require an any type
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected)
  }

  private async execute(): Promise<Result<EncryptedPayload, ProtectError>> {
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

        const context = await this.lockContext?.getLockContext()

        if (context.failure) {
          throw new Error(`[protect]: ${context.failure.message}`)
        }

        const val = await ffiEncrypt(
          client,
          plaintext,
          column,
          table,
          context.data.context,
          context.data.ctsToken,
        )
        return { c: val }
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
  private encryptedPayload: EncryptedPayload

  constructor(client: Client, encryptedPayload: EncryptedPayload) {
    this.client = client
    this.encryptedPayload = encryptedPayload
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

        if (this.encryptedPayload === null) {
          return null
        }

        logger.debug('Decrypting data WITHOUT a lock context')
        return await ffiDecrypt(this.client, this.encryptedPayload.c)
      },
      (error) => ({
        type: ProtectErrorTypes.DecryptionError,
        message: error.message,
      }),
    )
  }

  public getOperation(): {
    client: Client
    encryptedPayload: EncryptedPayload
  } {
    return {
      client: this.client,
      encryptedPayload: this.encryptedPayload,
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
        const { client, encryptedPayload } = this.operation.getOperation()

        if (!client) {
          throw noClientError()
        }

        if (encryptedPayload === null) {
          return null
        }

        logger.debug('Decrypting data WITH a lock context')

        const context = await this.lockContext?.getLockContext()

        if (context.failure) {
          throw new Error(`[protect]: ${context.failure.message}`)
        }

        return await ffiDecrypt(
          client,
          encryptedPayload.c,
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
  private column: string
  private table: string

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
          this.column,
        )

        logger.debug('Bulk encrypting data WITHOUT a lock context', {
          column: this.column,
          table: this.table,
        })

        const encryptedData = await ffiEncryptBulk(this.client, encryptPayloads)
        return encryptedData.map((enc, index) => ({
          c: enc,
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
    column: string
    table: string
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
            column,
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
          c: enc,
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
  private encryptedPayloads: BulkEncryptedData

  constructor(client: Client, encryptedPayloads: BulkEncryptedData) {
    this.client = client
    this.encryptedPayloads = encryptedPayloads
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

        if (!this.encryptedPayloads) {
          return null
        }

        const decryptPayloads = normalizeBulkDecryptPayloads(
          this.encryptedPayloads,
        )

        if (!decryptPayloads) {
          return null
        }

        logger.debug('Bulk decrypting data WITHOUT a lock context')

        const decryptedData = await ffiDecryptBulk(this.client, decryptPayloads)
        return decryptedData.map((dec, index) => {
          if (!this.encryptedPayloads) return null
          return {
            plaintext: dec,
            id: this.encryptedPayloads[index].id,
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
    encryptedPayloads: BulkEncryptedData
  } {
    return {
      client: this.client,
      encryptedPayloads: this.encryptedPayloads,
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
        const { client, encryptedPayloads } = this.operation.getOperation()

        if (!client) {
          throw noClientError()
        }

        if (!encryptedPayloads) {
          return null
        }

        const decryptPayloads =
          await normalizeBulkDecryptPayloadsWithLockContext(
            encryptedPayloads,
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
          if (!encryptedPayloads) return null
          return {
            plaintext: dec,
            id: encryptedPayloads[index].id,
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
   *    await eqlClient.decrypt(encryptedPayload)
   *    await eqlClient.decrypt(encryptedPayload).withLockContext(lockContext)
   */
  decrypt(encryptedPayload: EncryptedPayload): DecryptOperation {
    return new DecryptOperation(this.client, encryptedPayload)
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
   *    await eqlClient.bulkDecrypt(encryptedPayloads)
   *    await eqlClient.bulkDecrypt(encryptedPayloads).withLockContext(lockContext)
   */
  bulkDecrypt(encryptedPayloads: BulkEncryptedData): BulkDecryptOperation {
    return new BulkDecryptOperation(this.client, encryptedPayloads)
  }

  /** e.g., debugging or environment info */
  clientInfo() {
    return {
      workspaceId: this.workspaceId,
    }
  }
}
