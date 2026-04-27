import type {
  ResolvedStashConfig,
  TryLoadStashConfigResult,
} from '@/config/index.js'
import type { CredentialsResult } from '@/lib/auth-state.js'
import type { Integration } from '../wizard/lib/types.js'

export type CheckCategory =
  | 'project'
  | 'config'
  | 'auth'
  | 'env'
  | 'database'
  | 'integration'

export type CheckSeverity = 'error' | 'warn' | 'info'

export type CheckStatus = 'pass' | 'fail' | 'skip'

export interface DoctorFlags {
  json: boolean
  fix: boolean
  yes: boolean
  verbose: boolean
  skipDb: boolean
  only: ReadonlyArray<CheckCategory>
}

export interface PackageJson {
  name?: string
  version?: string
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  engines?: { node?: string }
}

export interface TokenInfo {
  workspaceId: string
  subject: string
  issuer: string
  services: Record<string, string>
}

/**
 * Lazy getters so N checks don't redo the same work (config load, jiti import,
 * DB connect). Each getter memoises its result — including negative results,
 * which are represented via the richer Try* types.
 */
export interface DoctorCache {
  cwd: string
  packageJson(): PackageJson | undefined
  stashConfig(): Promise<TryLoadStashConfigResult>
  /** Resolved encryption-client load result; depends on stashConfig. */
  encryptClient(): Promise<EncryptClientLoadResult>
  token(): Promise<CredentialsResult & { token?: TokenInfo }>
  integration(): Integration | undefined
  hasTypeScript(): boolean
}

export type EncryptClientLoadResult =
  | { ok: false; reason: 'no-config' }
  | { ok: false; reason: 'file-missing'; resolvedPath: string }
  | { ok: false; reason: 'import-failed'; resolvedPath: string; cause: unknown }
  | { ok: false; reason: 'no-export'; resolvedPath: string }
  | {
      ok: true
      resolvedPath: string
      config: ResolvedStashConfig
      /** `undefined` when the client resolves but `getEncryptConfig()` returns no tables. */
      tableCount: number
    }

export interface CheckContext {
  cwd: string
  cliVersion: string
  flags: DoctorFlags
  cache: DoctorCache
}

export interface CheckResult {
  status: CheckStatus
  /** Short one-line summary for human output. Required unless status === 'pass'. */
  message?: string
  /** Full actionable fix text — multi-line, shown under the failure. */
  fixHint?: string
  /** Structured payload for --json output. */
  details?: Record<string, unknown>
  /** Raw error for --verbose. */
  cause?: unknown
}

export interface AutoFix {
  description: string
  destructive: boolean
  run(ctx: CheckContext): Promise<CheckResult>
}

export interface Check {
  id: string
  title: string
  category: CheckCategory
  severity: CheckSeverity
  /** Other check ids this one depends on passing. If any dep fails/skips, this check is skipped. */
  dependsOn?: ReadonlyArray<string>
  run(ctx: CheckContext): Promise<CheckResult>
  autoFix?: AutoFix
}

export interface RunnerOutcome {
  check: Check
  result: CheckResult
}

export interface Summary {
  error: number
  warn: number
  info: number
  pass: number
  skip: number
}

export interface Report {
  cliVersion: string
  timestamp: string
  summary: Summary
  outcomes: ReadonlyArray<RunnerOutcome>
}
