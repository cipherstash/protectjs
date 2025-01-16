import { getLogger } from '@logtape/logtape'
const logger = getLogger(['jseql'])

export type CtsRegions = 'ap-southeast-2'

export type IdentifyOptions = {
  fetchFromCts?: boolean
}

export type CtsToken = {
  accessToken: string
  expiry: number
}

export type Context = {
  identityClaim: string[]
}

export type LockContextOptions = {
  context?: Context
  ctsToken?: CtsToken
}

export class LockContext {
  private ctsToken: CtsToken | undefined
  private workspaceId: string
  private context: Context

  constructor({
    context = { identityClaim: ['sub'] },
    ctsToken,
  }: LockContextOptions = {}) {
    if (!process.env.CS_WORKSPACE_ID) {
      const errorMessage =
        'CS_WORKSPACE_ID environment variable is not set, and is required to initialize a LockContext.'
      logger.error(errorMessage)
      throw new Error(`[ Server ] jseql: ${errorMessage}`)
    }

    if (ctsToken) {
      this.ctsToken = ctsToken
    }

    this.workspaceId = process.env.CS_WORKSPACE_ID
    this.context = context
    logger.debug('Successfully initialized the EQL lock context.')
  }

  async identify(jwtToken: string): Promise<LockContext> {
    const workspaceId = this.workspaceId

    const ctsEndoint =
      process.env.CS_CTS_ENDPOINT ||
      'https://ap-southeast-2.aws.auth.viturhosted.net'

    const ctsResponse = await fetch(`${ctsEndoint}/api/authorize`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        workspaceId,
        oidcToken: jwtToken,
      }),
    })

    console.log('[ Server ] jseql: CTS response', ctsResponse)

    if (!ctsResponse.ok) {
      throw new Error(
        `[ Server ] jseql: Failed to fetch CTS token: ${ctsResponse.statusText}`,
      )
    }

    const ctsToken = (await ctsResponse.json()) as CtsToken

    if (!ctsToken.accessToken) {
      const errorMessage =
        'The response from the CipherStash API did not contain an access token. Please contact support.'
      logger.error(errorMessage)
      throw new Error(errorMessage)
    }

    this.ctsToken = ctsToken
    return this
  }

  getLockContext(): {
    context: Context
    ctsToken: CtsToken
  } {
    if (!this.ctsToken) {
      const errorMessage =
        'Please call identify() with a users JWT token, or pass an existing CTS token to the LockContext constructor before calling getLockContext().'
      logger.error(errorMessage)
      throw new Error(errorMessage)
    }

    return {
      context: this.context,
      ctsToken: this.ctsToken,
    }
  }
}
