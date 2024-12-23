export type CtsRegions = 'ap-northeast-1' | 'us-east-1' | 'us-west-2' | 'eu-west-1' |
'ap-southeast-1' | 'us-west-1' | 'eu-central-1' | 'eu-west-2' | 'ap-south-1' |
'us-east-2' | 'ap-northeast-2' | 'ca-central-1' | 'ap-southeast-2' | 'eu-north-1' |
'sa-east-1' | 'eu-west-3' | 'ap-east-1' | 'me-south-1' | 'af-south-1'

export type Context = {
  identityClaim: string[]
  workspaceId: string
  region: CtsRegions
}

export type IdentifyOptions = {
  fetchFromCts?: boolean
}

export class LockContext {
  private cts_token: string | undefined
  private workspaceId: string
  private region: CtsRegions = 'ap-southeast-2'
  private context: Context

  constructor(context: Context) {
    this.region = context.region ?? this.region
    this.workspaceId = context.workspaceId
    this.context = context
  }

  async identify(jwtToken: string, {
    fetchFromCts = true,
  }: IdentifyOptions = {}): Promise<LockContext> {
    const workspaceId = this.workspaceId
    const region = this.region

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
        throw new Error(
          'Failed to initialize identity claim due to an error with the CipherStash API. Please contact support.',
        )
      }

      const data = await ctsResponse.json()

      if (!data.accessToken) {
        throw new Error('Failed to initialize identity claim due to an with the CipherStash API. Please contact support.')
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
      throw new Error('Please call identify() before getLockContext() to initialize the identity claim.')
    }

    return {
      context: this.context,
      cts_token: this.cts_token,
    }
  }
}