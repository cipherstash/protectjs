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
  /** Resolved DATABASE_URL. Set by resolve-database; threaded into every
   *  downstream step that needs DB access. Never logged or echoed. */
  databaseUrl?: string
  clientFilePath?: string
  schemaGenerated?: boolean
  /** True when the encryption schema was sourced from live DB introspection
   *  rather than the placeholder. Drives messaging in the action prompt. */
  schemaFromIntrospection?: boolean
  stackInstalled?: boolean
  /** True when the `stash` CLI is in the project's devDependencies. */
  cliInstalled?: boolean
  /** True when EQL was installed (or already-installed) by install-eql. */
  eqlInstalled?: boolean
  /** Detected ORM / framework integration. Set by build-schema. */
  integration?: Integration
  /** Schema definitions written to the encryption client. Carries every
   *  table the user picked during introspection (or the single placeholder
   *  for empty databases). The generated client file is still the canonical
   *  source for the full set of column types and search ops. */
  schemas?: SchemaDef[]
  /** Names of env keys observed in `.env*` files at init time. Never the
   *  values. Set by build-schema (so the baseline context.json has them);
   *  read by the handoff steps without re-scanning. */
  envKeys?: string[]
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
