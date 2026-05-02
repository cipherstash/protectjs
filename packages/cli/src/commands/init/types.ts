import type { AgentEnvironment } from './detect-agents.js'
import type { PackageManager } from './utils.js'

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

export type HandoffChoice = 'claude-code' | 'codex' | 'agents-md' | 'wizard'

export interface InitState {
  authenticated?: boolean
  clientFilePath?: string
  schemaGenerated?: boolean
  stackInstalled?: boolean
  forgeInstalled?: boolean
  /** Detected ORM / framework integration. Set by build-schema. */
  integration?: Integration
  /** Schema definition that was written to the client file (placeholder for now). */
  schema?: SchemaDef
  /** Available coding agents in the user's environment. Set by detect-agents. */
  agents?: AgentEnvironment
  /** What the user picked at the "how to proceed" step. */
  handoff?: HandoffChoice
}

export interface InitStep {
  id: string
  name: string
  run(state: InitState, provider: InitProvider): Promise<InitState>
}

export interface InitProvider {
  name: string
  introMessage: string
  getNextSteps(state: InitState, pm: PackageManager): string[]
}

export class CancelledError extends Error {
  constructor() {
    super('cancelled')
    this.name = 'CancelledError'
  }
}
