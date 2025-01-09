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

export type CtsToken = {
  accessToken: string
  expiry: number
}

export class LockContext {
  private cts_token: CtsToken | undefined
  private workspaceId: string
  private context: Context

  constructor(eqlClient: EqlClient, context: Context) {
    this.workspaceId = eqlClient.clientInfo().workspaceId
    this.context = context
    logger.debug('Successfully initialized the EQL lock context.')
  }

  async identify(jwtToken: string): Promise<LockContext> {
    const workspaceId = this.workspaceId

    // CipherStash CTS is only available in ap-southeast-2
    const region = 'ap-southeast-2'

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

    if (ctsResponse.status === 401) {
      const errorMessage =
        'The JWT token provided is invalid or the CipherStash token service can not be authenticated. Please check your JWT token and try again.'
      logger.error(errorMessage)
      throw new Error(errorMessage)
    }

    if (!ctsResponse.ok) {
      const errorMessage =
        'Failed to initialize identity claim due to an error with the CipherStash API. Please contact support.'
      logger.error(errorMessage)
      logger.debug('Error message from the CipherStash API:', {
        ctsResponse: ctsResponse.statusText,
      })

      throw new Error(errorMessage)
    }

    const data = await ctsResponse.json()

    if (!data.accessToken) {
      const errorMessage =
        'The response from the CipherStash API did not contain an access token. Please contact support.'
      logger.error(errorMessage)
      throw new Error(errorMessage)
    }

    this.cts_token = data
    return this
  }

  getLockContext(): {
    context: Context
    cts_token: CtsToken
  } {
    if (!this.cts_token) {
      const errorMessage =
        'Please call identify() before getLockContext() to initialize the identity claim with a JWT token.'
      logger.error(errorMessage)
      throw new Error(errorMessage)
    }

    return {
      context: this.context,
      cts_token: this.cts_token,
    }
  }
}
