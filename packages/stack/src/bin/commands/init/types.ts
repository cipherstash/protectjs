export type ConnectionMethod = 'drizzle' | 'supabase-js' | 'prisma' | 'raw-sql'

export type Integration = 'drizzle' | 'supabase' | 'postgresql'

export type DataType = 'string' | 'number' | 'boolean' | 'date' | 'json'

export type SearchOp = 'equality' | 'orderAndRange' | 'freeTextSearch'

export interface ColumnDef {
  name: string
  dataType: DataType
  searchOps: SearchOp[]
}

export interface SchemaDef {
  tableName: string
  columns: ColumnDef[]
}

export interface InitState {
  connectionMethod?: ConnectionMethod
  clientFilePath?: string
  schemaGenerated?: boolean
  stackInstalled?: boolean
  forgeInstalled?: boolean
}

export interface InitStep {
  id: string
  name: string
  run(state: InitState, provider: InitProvider): Promise<InitState>
}

export interface InitProvider {
  name: string
  introMessage: string
  connectionOptions: Array<{
    value: ConnectionMethod
    label: string
    hint?: string
  }>
  getNextSteps(state: InitState): string[]
}

export class CancelledError extends Error {
  constructor() {
    super('cancelled')
    this.name = 'CancelledError'
  }
}

/** Maps a connection method to the code generation integration type. */
export function toIntegration(method: ConnectionMethod): Integration {
  switch (method) {
    case 'drizzle':
      return 'drizzle'
    case 'supabase-js':
      return 'supabase'
    case 'prisma':
    case 'raw-sql':
      return 'postgresql'
  }
}
