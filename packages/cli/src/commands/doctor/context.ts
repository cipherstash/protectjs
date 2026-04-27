import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { tryLoadStashConfig } from '@/config/index.js'
import { probeCredentials } from '@/lib/auth-state.js'
import { detectIntegration, detectTypeScript } from '../wizard/lib/detect.js'
import type {
  CheckContext,
  DoctorCache,
  DoctorFlags,
  EncryptClientLoadResult,
  PackageJson,
  TokenInfo,
} from './types.js'

function readPackageJson(cwd: string): PackageJson | undefined {
  const pkgPath = path.resolve(cwd, 'package.json')
  if (!existsSync(pkgPath)) return undefined
  try {
    return JSON.parse(readFileSync(pkgPath, 'utf-8')) as PackageJson
  } catch {
    return undefined
  }
}

function memo<T>(fn: () => T): () => T {
  let called = false
  let value: T
  return () => {
    if (!called) {
      value = fn()
      called = true
    }
    return value
  }
}

function memoAsync<T>(fn: () => Promise<T>): () => Promise<T> {
  let promise: Promise<T> | undefined
  return () => {
    if (!promise) {
      promise = fn()
    }
    return promise
  }
}

/**
 * Resolve the encryption-client module referenced by `stash.config.ts`.
 *
 * Mirrors the loader in `config/index.ts` but returns a structured result
 * instead of calling `process.exit`. Only invoked once per doctor run via the
 * cache — individual checks branch on the `reason` field.
 */
async function loadEncryptClient(
  cwd: string,
): Promise<EncryptClientLoadResult> {
  const configResult = await tryLoadStashConfig()
  if (!configResult.ok) {
    return { ok: false, reason: 'no-config' }
  }

  const resolvedPath = path.resolve(cwd, configResult.config.client)
  if (!existsSync(resolvedPath)) {
    return { ok: false, reason: 'file-missing', resolvedPath }
  }

  const { createJiti } = await import('jiti')
  const jiti = createJiti(resolvedPath, { interopDefault: true })

  let moduleExports: Record<string, unknown>
  try {
    moduleExports = (await jiti.import(resolvedPath)) as Record<string, unknown>
  } catch (cause) {
    return { ok: false, reason: 'import-failed', resolvedPath, cause }
  }

  const client = Object.values(moduleExports).find(
    (value): value is { getEncryptConfig: () => unknown } =>
      !!value &&
      typeof value === 'object' &&
      'getEncryptConfig' in value &&
      typeof (value as { getEncryptConfig?: unknown }).getEncryptConfig ===
        'function',
  )

  if (!client) {
    return { ok: false, reason: 'no-export', resolvedPath }
  }

  const encryptConfig = client.getEncryptConfig() as
    | { tables?: Record<string, unknown> }
    | undefined

  const tableCount = encryptConfig?.tables
    ? Object.keys(encryptConfig.tables).length
    : 0

  return {
    ok: true,
    resolvedPath,
    config: configResult.config,
    tableCount,
  }
}

export function buildCache(cwd: string): DoctorCache {
  const packageJson = memo(() => readPackageJson(cwd))
  const stashConfig = memoAsync(() => tryLoadStashConfig())
  const encryptClient = memoAsync(() => loadEncryptClient(cwd))
  const integration = memo(() => detectIntegration(cwd))
  const hasTypeScript = memo(() => detectTypeScript(cwd))

  const token = memoAsync(async () => {
    const result = await probeCredentials()
    if (!result.ok) return result
    // probeCredentials only returns ok: true after getToken() resolves, but it
    // doesn't surface the token shape. Re-invoke to capture the claims for
    // downstream checks that need workspaceId/services.
    try {
      const auth = (await import('@cipherstash/auth')).default
      const tokenResult = await auth.AutoStrategy.detect().getToken()
      const token: TokenInfo = {
        workspaceId: tokenResult.workspaceId,
        subject: tokenResult.subject,
        issuer: tokenResult.issuer,
        services: tokenResult.services,
      }
      return { ok: true as const, token }
    } catch (cause) {
      const code = (cause as { code?: string } | null)?.code
      return { ok: false as const, code, cause }
    }
  })

  return {
    cwd,
    packageJson,
    stashConfig,
    encryptClient,
    token,
    integration,
    hasTypeScript,
  }
}

export function buildContext(params: {
  cwd: string
  cliVersion: string
  flags: DoctorFlags
}): CheckContext {
  return {
    cwd: params.cwd,
    cliVersion: params.cliVersion,
    flags: params.flags,
    cache: buildCache(params.cwd),
  }
}
