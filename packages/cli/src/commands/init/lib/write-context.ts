import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { InitState, Integration, SchemaDef } from '../types.js'
import {
  type PackageManager,
  detectPackageManager,
  prodInstallCommand,
} from '../utils.js'
import { upsertManagedBlock } from './sentinel-upsert.js'

export const CONTEXT_REL_PATH = '.cipherstash/context.json'

export interface ContextFile {
  rulebookVersion: string
  cliVersion: string
  integration: Integration
  encryptionClientPath: string
  packageManager: PackageManager
  installCommand: string
  envKeys: string[]
  schema: SchemaDef
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
        if (pkg.name === '@cipherstash/cli' && pkg.version) return pkg.version
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
  const schema = state.schema
  if (!schema) {
    // Should not happen — build-schema always populates this. Keep the
    // assertion explicit so a future refactor that drops the field gets
    // caught here rather than producing a half-empty context.json.
    throw new Error('Schema missing from init state — cannot write context.')
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
    schema,
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
