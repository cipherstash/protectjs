import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { DetectedPackageManager, Integration } from './types.js'

interface PackageJson {
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
}

function readPackageJson(cwd: string): PackageJson | undefined {
  const pkgPath = resolve(cwd, 'package.json')
  if (!existsSync(pkgPath)) return undefined
  try {
    return JSON.parse(readFileSync(pkgPath, 'utf-8')) as PackageJson
  } catch {
    return undefined
  }
}

function hasDependency(pkg: PackageJson, name: string): boolean {
  return !!(pkg.dependencies?.[name] || pkg.devDependencies?.[name])
}

/**
 * Auto-detect the integration framework from the project's package.json.
 * Returns the first matching integration, or undefined.
 */
export function detectIntegration(cwd: string): Integration | undefined {
  const pkg = readPackageJson(cwd)
  if (!pkg) return undefined

  // Order matters — most specific first
  if (hasDependency(pkg, 'drizzle-orm')) return 'drizzle'
  if (hasDependency(pkg, '@supabase/supabase-js')) return 'supabase'
  if (hasDependency(pkg, 'prisma') || hasDependency(pkg, '@prisma/client'))
    return 'prisma'

  return undefined
}

/** Detect whether the project uses TypeScript. */
export function detectTypeScript(cwd: string): boolean {
  const pkg = readPackageJson(cwd)
  if (pkg && hasDependency(pkg, 'typescript')) return true
  return existsSync(resolve(cwd, 'tsconfig.json'))
}

/** Detect the package manager used in the project. */
export function detectPackageManager(
  cwd: string,
): DetectedPackageManager | undefined {
  if (
    existsSync(resolve(cwd, 'bun.lockb')) ||
    existsSync(resolve(cwd, 'bun.lock'))
  ) {
    return { name: 'bun', installCommand: 'bun add', runCommand: 'bun run' }
  }
  if (existsSync(resolve(cwd, 'pnpm-lock.yaml'))) {
    return {
      name: 'pnpm',
      installCommand: 'pnpm add',
      runCommand: 'pnpm run',
    }
  }
  if (existsSync(resolve(cwd, 'yarn.lock'))) {
    return { name: 'yarn', installCommand: 'yarn add', runCommand: 'yarn run' }
  }
  if (existsSync(resolve(cwd, 'package-lock.json'))) {
    return { name: 'npm', installCommand: 'npm install', runCommand: 'npm run' }
  }
  return undefined
}
