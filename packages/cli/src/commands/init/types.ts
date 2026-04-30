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
  authenticated?: boolean
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
  getNextSteps(state: InitState): string[]
}

export class CancelledError extends Error {
  constructor() {
    super('cancelled')
    this.name = 'CancelledError'
  }
}
