import {
  newClient,
  encrypt as ffiEncrypt,
  decrypt as ffiDecrypt,
  encryptBulk as ffiEncryptBulk,
  decryptBulk as ffiDecryptBulk,
} from '@cipherstash/jseql-ffi'
import { logger } from '../../../utils/logger'
import { checkEnvironmentVariables } from './env-check'
import {
  normalizeBulkEncryptPayloads,
  normalizeBulkDecryptPayloads,
} from './payload-helpers'
import type { LockContext } from '../identify'

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

const noClientError = () =>
  new Error(
    'The EQL client has not been initialized. Please call init() before using the client.',
  )

class EncryptOperation implements PromiseLike<EncryptedPayload> {
  private client: Client
  private plaintext: EncryptPayload
  private column: string
  private table: string
  private lockContext?: LockContext

  constructor(client: Client, plaintext: EncryptPayload, opts: EncryptOptions) {
    this.client = client
    this.plaintext = plaintext
    this.column = opts.column
    this.table = opts.table
  }

  /** Optional lock context token. */
  public withLockContext(lockContext: LockContext): this {
    this.lockContext = lockContext
    return this
  }

  /** Implement the PromiseLike interface so `await` works. */
  public then<TResult1 = EncryptedPayload, TResult2 = never>(
    onfulfilled?:
      | ((value: EncryptedPayload) => TResult1 | PromiseLike<TResult1>)
      | null,
    // biome-ignore lint/suspicious/noExplicitAny: Rejections require an any type
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected)
  }

  /** Actual encryption logic, deferred until `then()` is called. */
  private async execute(): Promise<EncryptedPayload> {
    if (!this.client) {
      throw noClientError()
    }
    if (this.plaintext === null) {
      return null
    }

    // If a lock token was provided, we'll pass it to the FFI.
    if (this.lockContext) {
      logger.debug('Encrypting data WITH a lock context', {
        column: this.column,
        table: this.table,
      })

      const val = await ffiEncrypt(
        this.client,
        this.plaintext,
        this.column,
        this.lockContext.getLockContext().context,
        this.lockContext.getLockContext().ctsToken,
      )
      return { c: val }
    }

    logger.debug('Encrypting data WITHOUT a lock context', {
      column: this.column,
      table: this.table,
    })

    const val = await ffiEncrypt(this.client, this.plaintext, this.column)
    return { c: val }
  }
}

class DecryptOperation implements PromiseLike<string | null> {
  private client: Client
  private encryptedPayload: EncryptedPayload
  private lockContext?: LockContext

  constructor(client: Client, encryptedPayload: EncryptedPayload) {
    this.client = client
    this.encryptedPayload = encryptedPayload
  }

  public withLockContext(lockContext: LockContext): this {
    this.lockContext = lockContext
    return this
  }

  public then<TResult1 = string | null, TResult2 = never>(
    onfulfilled?:
      | ((value: string | null) => TResult1 | PromiseLike<TResult1>)
      | null,
    // biome-ignore lint/suspicious/noExplicitAny: Rejections require an any type
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected)
  }

  private async execute(): Promise<string | null> {
    if (!this.client) {
      throw noClientError()
    }

    if (this.encryptedPayload === null) {
      return null
    }

    try {
      if (this.lockContext) {
        logger.debug('Decrypting data WITH a lock context')

        return await ffiDecrypt(
          this.client,
          this.encryptedPayload.c,
          this.lockContext.getLockContext().context,
          this.lockContext.getLockContext().ctsToken,
        )
      }

      logger.debug('Decrypting data WITHOUT a lock context')
      return await ffiDecrypt(this.client, this.encryptedPayload.c)
    } catch (error) {
      logger.debug((error as Error).message)
      // Return original ciphertext if we fail to maintain application integrity
      return this.encryptedPayload.c
    }
  }
}

class BulkEncryptOperation implements PromiseLike<BulkEncryptedData> {
  private client: Client
  private plaintexts: BulkEncryptPayload
  private column: string
  private table: string
  private lockContext?: LockContext

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

  public withLockContext(lockContext: LockContext): this {
    this.lockContext = lockContext
    return this
  }

  public then<TResult1 = BulkEncryptedData, TResult2 = never>(
    onfulfilled?:
      | ((value: BulkEncryptedData) => TResult1 | PromiseLike<TResult1>)
      | null,
    // biome-ignore lint/suspicious/noExplicitAny: Rejections require an any type
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected)
  }

  private async execute(): Promise<BulkEncryptedData> {
    if (!this.client) {
      throw noClientError()
    }

    if (!this.plaintexts || this.plaintexts.length === 0) {
      return null
    }

    const encryptPayloads = normalizeBulkEncryptPayloads(
      this.plaintexts,
      this.column,
      this.lockContext || undefined,
    )

    if (this.lockContext) {
      logger.debug('Bulk encrypting data WITH a lock context', {
        column: this.column,
        table: this.table,
      })

      const encryptedData = await ffiEncryptBulk(
        this.client,
        encryptPayloads,
        this.lockContext.getLockContext().ctsToken,
      )

      return encryptedData.map((enc, index) => ({
        c: enc,
        id: this.plaintexts[index].id,
      }))
    }

    logger.debug('Bulk encrypting data WITHOUT a lock context', {
      column: this.column,
      table: this.table,
    })

    const encryptedData = await ffiEncryptBulk(this.client, encryptPayloads)
    return encryptedData.map((enc, index) => ({
      c: enc,
      id: this.plaintexts[index].id,
    }))
  }
}

class BulkDecryptOperation implements PromiseLike<BulkDecryptedData> {
  private client: Client
  private encryptedPayloads: BulkEncryptedData
  private lockContext?: LockContext

  constructor(client: Client, encryptedPayloads: BulkEncryptedData) {
    this.client = client
    this.encryptedPayloads = encryptedPayloads
  }

  public withLockContext(lockContext: LockContext): this {
    this.lockContext = lockContext
    return this
  }

  public then<TResult1 = BulkDecryptedData, TResult2 = never>(
    onfulfilled?:
      | ((value: BulkDecryptedData) => TResult1 | PromiseLike<TResult1>)
      | null,
    // biome-ignore lint/suspicious/noExplicitAny: Rejections require an any type
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected)
  }

  private async execute(): Promise<BulkDecryptedData> {
    if (!this.client) {
      throw noClientError()
    }

    if (!this.encryptedPayloads) {
      return null
    }

    const decryptPayloads = normalizeBulkDecryptPayloads(
      this.encryptedPayloads,
      this.lockContext || undefined,
    )

    if (!decryptPayloads) {
      return null
    }

    if (this.lockContext) {
      logger.debug('Bulk decrypting data WITH a lock context')

      const decryptedData = await ffiDecryptBulk(
        this.client,
        decryptPayloads,
        this.lockContext.getLockContext().ctsToken,
      )

      return decryptedData.map((dec, index) => {
        if (!this.encryptedPayloads) return null
        return {
          plaintext: dec,
          id: this.encryptedPayloads[index].id,
        }
      })
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
  }
}

export class EqlClient {
  private client: Client
  private workspaceId: string | undefined

  constructor() {
    checkEnvironmentVariables()

    logger.info(
      'Successfully initialized the EQL client with your defined environment variables.',
    )

    this.workspaceId = process.env.CS_WORKSPACE_ID
  }

  async init(): Promise<EqlClient> {
    const c = await newClient()
    this.client = c
    return this
  }

  /**
   * Encryption - returns a thenable object.
   * Usage:
   *    await eqlClient.encrypt(plaintext, { column, table })
   *    await eqlClient.encrypt(plaintext, { column, table }).withLockContext('some-cts-token')
   */
  encrypt(plaintext: EncryptPayload, opts: EncryptOptions): EncryptOperation {
    if (!this.client) {
      throw noClientError()
    }

    return new EncryptOperation(this.client, plaintext, opts)
  }

  /**
   * Decryption - returns a thenable object.
   * Usage:
   *    await eqlClient.decrypt(encryptedPayload)
   *    await eqlClient.decrypt(encryptedPayload).withLockContext('some-cts-token')
   */
  decrypt(encryptedPayload: EncryptedPayload): DecryptOperation {
    if (!this.client) {
      throw noClientError()
    }

    return new DecryptOperation(this.client, encryptedPayload)
  }

  /**
   * Bulk Encrypt - returns a thenable object.
   * Usage:
   *    await eqlClient.bulkEncrypt([{ plaintext, id }, ...], { column, table })
   *    await eqlClient
   *      .bulkEncrypt([{ plaintext, id }, ...], { column, table })
   *      .withLockContext('some-cts-token')
   */
  bulkEncrypt(
    plaintexts: BulkEncryptPayload,
    opts: EncryptOptions,
  ): BulkEncryptOperation {
    if (!this.client) {
      throw noClientError()
    }

    return new BulkEncryptOperation(this.client, plaintexts, opts)
  }

  /**
   * Bulk Decrypt - returns a thenable object.
   * Usage:
   *    await eqlClient.bulkDecrypt(encryptedPayloads)
   *    await eqlClient.bulkDecrypt(encryptedPayloads).withLockContext('some-cts-token')
   */
  bulkDecrypt(encryptedPayloads: BulkEncryptedData): BulkDecryptOperation {
    if (!this.client) {
      throw noClientError()
    }

    return new BulkDecryptOperation(this.client, encryptedPayloads)
  }

  /** e.g., debugging or environment info */
  clientInfo() {
    return {
      workspaceId: this.workspaceId,
    }
  }
}
