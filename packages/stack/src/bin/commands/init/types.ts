export interface InitState {
  accessToken?: string
  workspaceId?: string
  workspaceName?: string
  region?: string
  connectionMethod?: string
  databaseUrl?: string
  eqlInstalled?: boolean
}

export interface InitStep {
  id: string
  name: string
  run(state: InitState, provider: InitProvider): Promise<InitState>
}

export interface InitProvider {
  name: string
  introMessage: string
  connectionOptions: Array<{ value: string; label: string; hint?: string }>
  getNextSteps(state: InitState): string[]
}

export class CancelledError extends Error {
  constructor() {
    super('cancelled')
    this.name = 'CancelledError'
  }
}
