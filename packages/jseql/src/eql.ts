// TODO: Fix ffi build so that we can import it directly
const { newClient, encrypt, decrypt } = require('@cipherstash/jseql-ffi')
import { getLogger } from '@logtape/logtape'
const logger = getLogger(['jseql'])
import type { LockContext } from './identify'

export class EqlClient {
  // biome-ignore lint/suspicious/noExplicitAny: jseql-ffi is not typed
  private client: any
  private workspaceId
  private clientId
  private clientKey
  private accessToken

  constructor({
    workspaceId,
    clientId,
    clientKey,
    accessToken,
  }: {
    workspaceId: string
    clientId: string
    clientKey: string
    accessToken: string
  }) {
    this.workspaceId = workspaceId
    this.clientId = clientId
    this.clientKey = clientKey
    this.accessToken = accessToken
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
      const lockContextData = lockContext.getLockContext()

      logger.debug('Encrypting with lock context', {
        context: lockContextData.context,
        column,
        table,
      })

      return await encrypt(this.client, plaintext, column, {
        identityClaim: lockContextData.context.identityClaim,
      }).then((val: string) => {
        return { c: val }
      })
    }

    logger.debug('Encrypting without a lock context', {
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
      const lockContextData = lockContext.getLockContext()

      logger.debug('Decrypting with lock context', {
        context: lockContextData.context,
      })

      return await decrypt(this.client, encryptedPayload.c, {
        identityClaim: lockContextData.context.identityClaim,
      })
    }

    logger.debug('Decrypting without a lock context')
    return await decrypt(this.client, encryptedPayload.c)
  }
}

export type EncryptedEqlPayload = {
  c: string
}
