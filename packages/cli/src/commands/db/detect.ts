import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Return true when the connection string points at a Supabase-hosted Postgres.
 *
 * Supabase routes production connections through `*.supabase.co`,
 * `*.supabase.com`, and the pgBouncer pooler at `*.pooler.supabase.com`.
 * Matching on host means we auto-detect regardless of direct vs pooled
 * connection string.
 */
export function detectSupabase(databaseUrl: string | undefined): boolean {
  if (!databaseUrl) return false

  let host: string
  try {
    host = new URL(databaseUrl).hostname
  } catch {
    return false
  }

  return (
    host.endsWith('.supabase.co') ||
    host.endsWith('.supabase.com') ||
    host.endsWith('.pooler.supabase.com')
  )
}

/**
 * Return true when the project uses Drizzle.
 *
 * We look for a `drizzle.config.*` file at the cwd (fast path) or
 * `drizzle-orm` / `drizzle-kit` listed in the project's package.json.
 * Either signal alone is enough — Drizzle users always have at least one.
 */
export function detectDrizzle(cwd: string): boolean {
  const configCandidates = [
    'drizzle.config.ts',
    'drizzle.config.js',
    'drizzle.config.mjs',
    'drizzle.config.cjs',
  ]
  for (const candidate of configCandidates) {
    if (existsSync(resolve(cwd, candidate))) return true
  }

  const pkgPath = resolve(cwd, 'package.json')
  if (!existsSync(pkgPath)) return false

  try {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as {
      dependencies?: Record<string, unknown>
      devDependencies?: Record<string, unknown>
      peerDependencies?: Record<string, unknown>
      optionalDependencies?: Record<string, unknown>
    }
    const deps = {
      ...pkg.dependencies,
      ...pkg.devDependencies,
      ...pkg.peerDependencies,
      ...pkg.optionalDependencies,
    }
    return 'drizzle-orm' in deps || 'drizzle-kit' in deps
  } catch {
    return false
  }
}
