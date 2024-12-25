import type { EqlClient } from '../eql'
import { getLogger } from '@logtape/logtape'
const logger = getLogger(['jseql'])

export type CtsRegions = 'ap-southeast-2'

export type Context = {
  identityClaim: string[]
}

export type IdentifyOptions = {
  fetchFromCts?: boolean
}

export class LockContext {
  private cts_token: string | undefined
  private workspaceId: string
  private context: Context

  constructor(eqlClient: EqlClient, context: Context) {
    this.workspaceId = eqlClient.clientInfo().workspaceId
    this.context = context
    logger.debug('Successfully initialized the lock context.')
  }

  async identify(
    jwtToken: string,
    { fetchFromCts = true }: IdentifyOptions = {},
  ): Promise<LockContext> {
    const workspaceId = this.workspaceId

    // CipherStash CTS is only available in ap-southeast-2
    const region = 'ap-southeast-2'

    if (fetchFromCts) {
      const ctsResponse = await fetch(
        `https://${region}.aws.auth.viturhosted.net/api/federate`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${jwtToken}`,
          },
          body: JSON.stringify({
            workspaceId,
          }),
        },
      )

      if (!ctsResponse.ok) {
        const errorMessage =
          'Failed to initialize identity claim due to an error with the CipherStash API. Please contact support.'
        logger.error(errorMessage)
        throw new Error(errorMessage)
      }

      const data = await ctsResponse.json()

      if (!data.accessToken) {
        const errorMessage =
          'Failed to initialize identity claim due to an error with the CipherStash API. Please contact support.'
        logger.error(errorMessage)
        throw new Error(errorMessage)
      }

      this.cts_token = data.accessToken
      return this
    }

    // TODO: Work with CipherStash engineering to implement this
    this.cts_token = jwtToken
    return this
  }

  getLockContext(): {
    context: Context
    cts_token: string
  } {
    if (!this.cts_token) {
      const errorMessage =
        'Please call identify() before getLockContext() to initialize the identity claim.'
      logger.error(errorMessage)
      throw new Error(errorMessage)
    }

    return {
      context: this.context,
      cts_token: this.cts_token,
    }
  }
}
