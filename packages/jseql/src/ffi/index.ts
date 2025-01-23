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
class EncryptOperation implements PromiseLike<EncryptedPayload> {
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

    logger.debug('Encrypting data WITHOUT a lock context', {
      column: this.column,
      table: this.table,
    })

    const val = await ffiEncrypt(this.client, this.plaintext, this.column)
    return { c: val }
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

class EncryptOperationWithLockContext implements PromiseLike<EncryptedPayload> {
  private operation: EncryptOperation
  private lockContext: LockContext

  constructor(operation: EncryptOperation, lockContext: LockContext) {
    this.operation = operation
    this.lockContext = lockContext
  }

  public then<TResult1 = EncryptedPayload, TResult2 = never>(
    onfulfilled?:
      | ((value: EncryptedPayload) => TResult1 | PromiseLike<TResult1>)
      | null,
    // biome-ignore lint/suspicious/noExplicitAny: Rejections require an any type
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected)
  }

  private async execute(): Promise<EncryptedPayload> {
    const { client, plaintext, column, table } = this.operation.getOperation()

    if (!client) {
      throw noClientError()
    }

    if (plaintext === null) {
      return null
    }

    logger.debug('Encrypting data WITH a lock context')

    const context = this.lockContext?.getLockContext()

    if (!context?.success) {
      throw new Error(`[jseql]: ${context?.error}`)
    }

    const val = await ffiEncrypt(
      client,
      plaintext,
      column,
      context.context,
      context.ctsToken,
    )
    return { c: val }
  }
}

// ------------------------
// Decryption operation implementations
// ------------------------
class DecryptOperation implements PromiseLike<string | null> {
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

    logger.debug('Decrypting data WITHOUT a lock context')
    return await ffiDecrypt(this.client, this.encryptedPayload.c)
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

class DecryptOperationWithLockContext implements PromiseLike<string | null> {
  private operation: DecryptOperation
  private lockContext: LockContext

  constructor(operation: DecryptOperation, lockContext: LockContext) {
    this.operation = operation
    this.lockContext = lockContext
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
    const { client, encryptedPayload } = this.operation.getOperation()

    if (!client) {
      throw noClientError()
    }

    if (encryptedPayload === null) {
      return null
    }

    logger.debug('Decrypting data WITH a lock context')

    const context = this.lockContext?.getLockContext()

    if (!context?.success) {
      throw new Error(`[jseql]: ${context?.error}`)
    }

    return await ffiDecrypt(
      client,
      encryptedPayload.c,
      context.context,
      context.ctsToken,
    )
  }
}

// ------------------------
// Bulk Encryption operation implementations
// ------------------------
class BulkEncryptOperation implements PromiseLike<BulkEncryptedData> {
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
      false,
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
  implements PromiseLike<BulkEncryptedData>
{
  private operation: BulkEncryptOperation
  private lockContext: LockContext

  constructor(operation: BulkEncryptOperation, lockContext: LockContext) {
    this.operation = operation
    this.lockContext = lockContext
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
    const { client, plaintexts, column, table } = this.operation.getOperation()

    if (!client) {
      throw noClientError()
    }

    if (!plaintexts || plaintexts.length === 0) {
      return null
    }

    const encryptPayloads = normalizeBulkEncryptPayloads(
      plaintexts,
      column,
      true,
      this.lockContext,
    )

    logger.debug('Bulk encrypting data WITH a lock context', {
      column,
      table,
    })

    const context = this.lockContext.getLockContext()

    if (!context.success) {
      throw new Error(`[jseql]: ${context?.error}`)
    }

    const encryptedData = await ffiEncryptBulk(
      client,
      encryptPayloads,
      context.ctsToken,
    )

    return encryptedData.map((enc, index) => ({
      c: enc,
      id: plaintexts[index].id,
    }))
  }
}

// ------------------------
// Bulk Decryption operation implementations
// ------------------------
class BulkDecryptOperation implements PromiseLike<BulkDecryptedData> {
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
      false,
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
  implements PromiseLike<BulkDecryptedData>
{
  private operation: BulkDecryptOperation
  private lockContext: LockContext

  constructor(operation: BulkDecryptOperation, lockContext: LockContext) {
    this.operation = operation
    this.lockContext = lockContext
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
    const { client, encryptedPayloads } = this.operation.getOperation()

    if (!client) {
      throw noClientError()
    }

    if (!encryptedPayloads) {
      return null
    }

    const decryptPayloads = normalizeBulkDecryptPayloads(
      encryptedPayloads,
      true,
      this.lockContext,
    )

    if (!decryptPayloads) {
      return null
    }

    logger.debug('Bulk decrypting data WITH a lock context')

    const context = this.lockContext.getLockContext()

    if (!context.success) {
      throw new Error(`[jseql]: ${context?.error}`)
    }

    const decryptedData = await ffiDecryptBulk(
      client,
      decryptPayloads,
      context.ctsToken,
    )

    return decryptedData.map((dec, index) => {
      if (!encryptedPayloads) return null
      return {
        plaintext: dec,
        id: encryptedPayloads[index].id,
      }
    })
  }
}

// ------------------------
// Main EQL Client
// ------------------------
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
   *    await eqlClient.encrypt(plaintext, { column, table }).withLockContext(lockContext)
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
   *    await eqlClient.decrypt(encryptedPayload).withLockContext(lockContext)
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
   *      .withLockContext(lockContext)
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
   *    await eqlClient.bulkDecrypt(encryptedPayloads).withLockContext(lockContext)
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
