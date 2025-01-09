// TODO: Fix ffi build so that we can import it directly
const { newClient, encrypt, decrypt } = require('@cipherstash/jseql-ffi')
import { getLogger } from '@logtape/logtape'
const logger = getLogger(['jseql'])
import type { LockContext } from '../identify'

export class EqlClient {
  // biome-ignore lint/suspicious/noExplicitAny: jseql-ffi is not typed
  private client: any
  private workspaceId
  private clientId
  private clientKey
  private accessToken

  constructor() {
    const errorMessage = (message: string) => `Initialization error: ${message}`
    let message = ''

    if (!process.env.CS_WORKSPACE_ID) {
      message = errorMessage(
        'The environment variable "CS_WORKSPACE_ID" must be set. You can find your workspace ID in the CipherStash dashboard.',
      )

      logger.error(message)
      throw new Error(message)
    }

    if (!process.env.CS_CLIENT_ID || !process.env.CS_CLIENT_KEY) {
      message = errorMessage(
        'The environment variables "CS_CLIENT_ID" and "CS_CLIENT_KEY" must be set. You must use the CipherStash CLI to generate a new client key pair.',
      )

      logger.error(message)
      throw new Error(message)
    }

    if (!process.env.CS_CLIENT_ACCESS_KEY) {
      message = errorMessage(
        'The environment variable "CS_CLIENT_ACCESS_KEY" must be set. Generate a new access token in the CipherStash dashboard or CLI.',
      )

      logger.error(message)
      throw new Error(message)
    }

    logger.info(
      'Successfully initialized the EQL client with your defined environment variables.',
    )

    this.workspaceId = process.env.CS_WORKSPACE_ID
    this.clientId = process.env.CS_CLIENT_ID
    this.clientKey = process.env.CS_CLIENT_KEY
    this.accessToken = process.env.CS_CLIENT_ACCESS_KEY
  }

  async init(): Promise<EqlClient> {
    const client = await newClient()
    this.client = client
    return this
  }

  async encrypt(
    plaintext: string,
    {
      column,
      table,
      lockContext,
    }: {
      column: string
      table: string
      lockContext?: LockContext
    },
  ): Promise<EncryptedEqlPayload> {
    if (lockContext) {
      const { cts_token, context } = lockContext.getLockContext()

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
        cts_token,
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
    encryptedPayload: EncryptedEqlPayload,
    {
      lockContext,
    }: {
      lockContext?: LockContext
    } = {},
  ): Promise<string> {
    if (lockContext) {
      const { cts_token, context } = lockContext.getLockContext()

      logger.debug('Decrypting data with lock context', {
        context,
      })

      return await decrypt(
        this.client,
        encryptedPayload.c,
        {
          identityClaim: context.identityClaim,
        },
        cts_token,
      )
    }

    logger.debug('Decrypting data without a lock context')
    return await decrypt(this.client, encryptedPayload.c)
  }

  clientInfo() {
    return {
      workspaceId: this.workspaceId,
      clientId: this.clientId,
    }
  }
}

export type EncryptedEqlPayload = {
  c: string
}
