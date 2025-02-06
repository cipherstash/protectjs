import { logger } from '../../../utils/logger'

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

export type GetLockContextResponse =
  | {
      success: boolean
      error: string
      ctsToken?: never
      context?: never
    }
  | {
      success: boolean
      error?: never
      ctsToken: CtsToken
      context: Context
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
      throw new Error(`[protect]: ${errorMessage}`)
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

    if (!ctsResponse.ok) {
      throw new Error(
        `[protect]: Failed to fetch CTS token: ${ctsResponse.statusText}`,
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

  getLockContext(): GetLockContextResponse {
    if (!this.ctsToken?.accessToken && !this.ctsToken?.expiry) {
      return {
        success: false,
        error:
          'The CTS token is not set. Please call identify() with a users JWT token, or pass an existing CTS token to the LockContext constructor before calling getLockContext().',
      }
    }

    return {
      success: true,
      context: this.context,
      ctsToken: this.ctsToken,
    }
  }
}
