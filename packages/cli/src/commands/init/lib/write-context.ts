import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  RULEBOOK_VERSION,
  type SetupPromptContext,
  renderSetupPrompt,
} from '../../../rulebook/index.js'
import type {
  HandoffChoice,
  InitState,
  Integration,
  SchemaDef,
} from '../types.js'
import {
  type PackageManager,
  detectPackageManager,
  prodInstallCommand,
} from '../utils.js'
import { upsertManagedBlock } from './sentinel-upsert.js'

export const CONTEXT_REL_PATH = '.cipherstash/context.json'
export const SETUP_PROMPT_REL_PATH = '.cipherstash/setup-prompt.md'

export interface ContextFile {
  rulebookVersion: string
  cliVersion: string
  integration: Integration
  encryptionClientPath: string
  packageManager: PackageManager
  installCommand: string
  envKeys: string[]
  /** Every encrypted-table schema written to the encryption client. The
   *  generated client file is still authoritative for column types and ops;
   *  this lets agents see the full set without parsing TypeScript. */
  schemas: SchemaDef[]
  generatedAt: string
}

/**
 * Walk up from this file to find the CLI's package.json. The compiled file
 * lives at `dist/index.js` (or similar) and the source at
 * `src/commands/init/lib/write-context.ts`, so we walk up to six levels.
 * Falling back to `'unknown'` is fine — the field is informational.
 */
export function readCliVersion(): string {
  let dir = dirname(fileURLToPath(import.meta.url))
  for (let i = 0; i < 6; i++) {
    const candidate = resolve(dir, 'package.json')
    if (existsSync(candidate)) {
      try {
        const pkg = JSON.parse(readFileSync(candidate, 'utf-8')) as {
          name?: string
          version?: string
        }
        if (pkg.name === 'stash' && pkg.version) return pkg.version
      } catch {
        // keep walking
      }
    }
    dir = dirname(dir)
  }
  return 'unknown'
}

function ensureDir(path: string): void {
  const dir = dirname(path)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
}

/**
 * Write a project artifact (SKILL.md / AGENTS.md / etc.) using the
 * managed-block upsert util so re-runs replace only our region.
 */
export function writeArtifact(absPath: string, body: string): void {
  const existing = existsSync(absPath)
    ? readFileSync(absPath, 'utf-8')
    : undefined
  const next = upsertManagedBlock({ existing, managed: body })
  ensureDir(absPath)
  writeFileSync(absPath, next, 'utf-8')
}

/**
 * Build the universal `.cipherstash/context.json` from `InitState` plus the
 * resolved rulebook version. Throws on a missing schema — the build-schema
 * step is required to have run before any handoff fires.
 */
export function buildContextFile(
  state: InitState,
  rulebookVersion: string,
): ContextFile {
  const integration = state.integration ?? 'postgresql'
  const clientFilePath = state.clientFilePath ?? './src/encryption/index.ts'
  const schemas = state.schemas
  if (!schemas || schemas.length === 0) {
    // Should not happen — build-schema always populates this. Keep the
    // assertion explicit so a future refactor that drops the field gets
    // caught here rather than producing a half-empty context.json.
    throw new Error('Schemas missing from init state — cannot write context.')
  }

  const pm = detectPackageManager()
  return {
    rulebookVersion,
    cliVersion: readCliVersion(),
    integration,
    encryptionClientPath: clientFilePath,
    packageManager: pm,
    installCommand: prodInstallCommand(pm, '@cipherstash/stack'),
    envKeys: [],
    schemas,
    generatedAt: new Date().toISOString(),
  }
}

/**
 * Persist the context file to disk. The CLI owns this path; never call from
 * outside the init / handoff steps.
 */
export function writeContextFile(absPath: string, ctx: ContextFile): void {
  ensureDir(absPath)
  writeFileSync(absPath, `${JSON.stringify(ctx, null, 2)}\n`, 'utf-8')
}

/**
 * Write `.cipherstash/context.json` immediately after the encryption client
 * is generated, using the bundled rulebook version. Handoff steps refresh
 * it later with the gateway-served rulebook version (when reachable), but
 * having a baseline here means the file is always in sync with the
 * encryption client even if init aborts mid-flow.
 *
 * Without this baseline, a failed install-eql or a Ctrl+C between
 * build-schema and the handoff would leave context.json from a previous
 * run on disk — which an agent reading it would happily believe.
 */
export function writeBaselineContextFile(
  state: InitState,
  cwd: string,
  envKeys: string[],
): void {
  if (!state.schemas || state.schemas.length === 0) return
  const absPath = resolve(cwd, CONTEXT_REL_PATH)
  const ctx = buildContextFile(state, RULEBOOK_VERSION)
  ctx.envKeys = envKeys
  writeContextFile(absPath, ctx)
}

/**
 * Build a `SetupPromptContext` from the current init state for the given
 * handoff choice. Returns `undefined` for the wizard handoff — the wizard
 * has its own prompt logic and doesn't read this file.
 */
export function buildSetupPromptContext(
  state: InitState,
  handoff: HandoffChoice,
): SetupPromptContext | undefined {
  if (handoff === 'wizard') return undefined
  const integration = state.integration ?? 'postgresql'
  const encryptionClientPath =
    state.clientFilePath ?? './src/encryption/index.ts'
  return {
    integration,
    encryptionClientPath,
    packageManager: detectPackageManager(),
    schemaFromIntrospection: state.schemaFromIntrospection ?? false,
    eqlInstalled: state.eqlInstalled ?? false,
    stackInstalled: state.stackInstalled ?? false,
    cliInstalled: state.cliInstalled ?? false,
    handoff,
  }
}

/**
 * Render and persist `.cipherstash/setup-prompt.md`. The file is plain
 * markdown — no sentinel markers — because it's regenerated wholesale on
 * every init run and is meant to reflect the current state, not a managed
 * block alongside user content.
 */
export function writeSetupPrompt(
  absPath: string,
  ctx: SetupPromptContext,
): void {
  ensureDir(absPath)
  writeFileSync(absPath, renderSetupPrompt(ctx), 'utf-8')
}
