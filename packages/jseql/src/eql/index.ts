import {
  newClient,
  decrypt,
  encrypt,
  encryptBulk,
  decryptBulk,
  type BulkEncryptPayload,
  type BulkDecryptPayload,
} from '@cipherstash/jseql-ffi'
import { logger } from '../logger'
import type { LockContext } from '../identify'

export class EqlClient {
  // biome-ignore lint/suspicious/noExplicitAny: jseql-ffi is not typed
  private client: any
  private workspaceId

  constructor() {
    const errorMessage = (message: string) => `Initialization error: ${message}`
    let message = ''

    if (!process.env.CS_WORKSPACE_ID) {
      message = errorMessage(
        'The environment variable "CS_WORKSPACE_ID" must be set. You can find your workspace ID in the CipherStash dashboard.',
      )

      logger.error(message)
      throw new Error(`[ Server ] jseql: ${message}`)
    }

    if (!process.env.CS_CLIENT_ID || !process.env.CS_CLIENT_KEY) {
      message = errorMessage(
        'The environment variables "CS_CLIENT_ID" and "CS_CLIENT_KEY" must be set. You must use the CipherStash CLI to generate a new client key pair.',
      )

      logger.error(message)
      throw new Error(`[ Server ] jseql: ${message}`)
    }

    if (!process.env.CS_CLIENT_ACCESS_KEY) {
      message = errorMessage(
        'The environment variable "CS_CLIENT_ACCESS_KEY" must be set. Generate a new access token in the CipherStash dashboard or CLI.',
      )

      logger.error(message)
      throw new Error(`[ Server ] jseql: ${message}`)
    }

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
    plaintext: string | null,
    {
      column,
      table,
      lockContext,
    }: {
      column: string
      table: string
      lockContext?: LockContext
    },
  ): Promise<EncryptedEqlPayload | null> {
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

  async decrypt(
    encryptedPayload: EncryptedEqlPayload | null,
    {
      lockContext,
    }: {
      lockContext?: LockContext
    } = {},
  ): Promise<string | null> {
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
      const errorMessage = error as Error
      logger.error(errorMessage.message)
      return encryptedPayload.c
    }
  }

  async bulkEncrypt(
    plaintexts: {
      plaintext: string
      id: string
    }[],
    {
      column,
      table,
      lockContext,
    }: {
      column: string
      table: string
      lockContext?: LockContext
    },
  ): Promise<BulkEncryptedEqlPayload | null> {
    if (plaintexts.length === 0) {
      return null
    }

    const encryptPayloads: BulkEncryptPayload[] = plaintexts.reduce(
      (acc, plaintext) => {
        const payload = {
          plaintext: plaintext.plaintext,
          column,
          ...(lockContext
            ? {
                lockContext: lockContext.getLockContext().context,
              }
            : {}),
        }

        acc.push(payload)
        return acc
      },
      [] as BulkEncryptPayload[],
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
    encryptedPayloads: BulkEncryptedEqlPayload | null,
    {
      lockContext,
    }: {
      lockContext?: LockContext
    } = {},
  ): Promise<BulkDecryptedData | null> {
    if (encryptedPayloads?.length === 0 || encryptedPayloads === null) {
      return null
    }

    const decryptPayloads: BulkDecryptPayload[] = encryptedPayloads.reduce(
      (acc, encryptedPayload) => {
        const payload = {
          ciphertext: encryptedPayload.c,
          ...(lockContext
            ? {
                lockContext: lockContext.getLockContext().context,
              }
            : {}),
        }

        acc.push(payload)
        return acc
      },
      [] as BulkDecryptPayload[],
    )

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

export type EncryptedEqlPayload = {
  c: string
}

export type BulkEncryptedEqlPayload = {
  c: string
  id: string
}[]

export type BulkDecryptedData = {
  plaintext: string
  id: string
}[]
