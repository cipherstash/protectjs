import {
  newClient,
  decrypt,
  encrypt,
  encryptBulk,
  decryptBulk,
  type BulkEncryptPayload as InternalBulkEncryptPayload,
  type BulkDecryptPayload as InternalBulkDecryptPayload,
} from '@cipherstash/jseql-ffi'
import { logger } from '../logger'
import type { LockContext } from '../identify'
import { checkEnvironmentVariables } from './env-check'
import {
  normalizeBulkDecryptPayloads,
  normalizeBulkEncryptPayloads,
} from './payload-helpers'

type Client = Awaited<ReturnType<typeof newClient>> | undefined

const noClientError = () =>
  new Error(
    'The EQL client has not been initialized. Please call the init() method before using the client.',
  )

export class EqlClient {
  private client: Client
  private workspaceId

  constructor() {
    checkEnvironmentVariables()

    logger.info(
      'Successfully initialized the EQL client with your defined environment variables.',
    )

    this.workspaceId = process.env.CS_WORKSPACE_ID
  }

  async init(): Promise<EqlClient> {
    const client = await newClient()
    this.client = client
    return this
  }

  async encrypt(
    plaintext: EncryptPayload,
    { column, table, lockContext }: EncryptOptions,
  ): Promise<EncryptedPayload> {
    if (!this.client) {
      throw noClientError()
    }

    if (plaintext === null) {
      return null
    }

    if (lockContext) {
      const { ctsToken, context } = lockContext.getLockContext()

      logger.debug('Encrypting data with lock context', {
        context,
        column,
        table,
      })

      return await encrypt(
        this.client,
        plaintext,
        column,
        {
          identityClaim: context.identityClaim,
        },
        ctsToken,
      ).then((val: string) => {
        return { c: val }
      })
    }

    logger.debug('Encrypting data without a lock context', {
      column,
      table,
    })

    return await encrypt(this.client, plaintext, column).then((val: string) => {
      return { c: val }
    })
  }

  // make decrypt options optional
  async decrypt(
    encryptedPayload: EncryptedPayload,
    { lockContext }: DecryptOptions = {},
  ): Promise<string | null> {
    if (!this.client) {
      throw noClientError()
    }

    if (encryptedPayload === null) {
      return null
    }

    try {
      if (lockContext) {
        const { ctsToken, context } = lockContext.getLockContext()

        logger.debug('Decrypting data with lock context', {
          context,
        })

        return await decrypt(
          this.client,
          encryptedPayload.c,
          {
            identityClaim: context.identityClaim,
          },
          ctsToken,
        )
      }

      logger.debug('Decrypting data without a lock context')
      return await decrypt(this.client, encryptedPayload.c)
    } catch (error) {
      logger.debug((error as Error).message)
      return encryptedPayload.c
    }
  }

  async bulkEncrypt(
    plaintexts: BulkEncryptPayload,
    { column, table, lockContext }: EncryptOptions,
  ): Promise<BulkEncryptedData> {
    if (!this.client) {
      throw noClientError()
    }

    if (plaintexts.length === 0 || plaintexts === null) {
      return null
    }

    const encryptPayloads = normalizeBulkEncryptPayloads(
      plaintexts,
      column,
      lockContext,
    )

    logger.debug('Bulk encrypting data...', {
      column,
      table,
    })

    let encryptedData: string[]

    if (lockContext) {
      const { ctsToken, context } = lockContext.getLockContext()

      logger.debug('Bulk encrypting data with lock context', {
        context,
        column,
        table,
      })

      encryptedData = await encryptBulk(this.client, encryptPayloads, ctsToken)
    } else {
      logger.debug('Bulk encrypting data without a lock context', {
        column,
        table,
      })

      encryptedData = await encryptBulk(this.client, encryptPayloads)
    }

    const response = encryptedData?.map((encryptedData, index) => {
      return {
        c: encryptedData,
        id: plaintexts[index].id,
      }
    })

    return response
  }

  async bulkDecrypt(
    encryptedPayloads: BulkEncryptedData,
    { lockContext }: DecryptOptions = {},
  ): Promise<BulkDecryptedData> {
    if (!this.client) {
      throw noClientError()
    }

    const decryptPayloads = normalizeBulkDecryptPayloads(
      encryptedPayloads,
      lockContext,
    )

    if (!decryptPayloads) {
      return null
    }

    let decryptedData: string[]

    if (lockContext) {
      const { ctsToken, context } = lockContext.getLockContext()

      logger.debug('Decrypting data with lock context', {
        context,
      })

      decryptedData = await decryptBulk(this.client, decryptPayloads, ctsToken)
    } else {
      logger.debug('Decrypting data without a lock context')
      decryptedData = await decryptBulk(this.client, decryptPayloads)
    }

    const response = decryptedData?.map((decryptedData, index) => {
      if (!encryptedPayloads) {
        return null
      }

      return {
        plaintext: decryptedData,
        id: encryptedPayloads[index].id,
      }
    })

    return response
  }

  clientInfo() {
    return {
      workspaceId: this.workspaceId,
    }
  }
}

export type EncryptPayload = string | null

export type BulkEncryptPayload = {
  plaintext: string
  id: string
}[]

export type EncryptOptions = {
  column: string
  table: string
  lockContext?: LockContext
}

// make decrypt options optional
export type DecryptOptions = {
  lockContext?: LockContext
}

export type EncryptedPayload = {
  c: string
} | null

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
