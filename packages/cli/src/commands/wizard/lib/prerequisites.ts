import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { homedir } from 'node:os'

interface PrerequisiteResult {
  ok: boolean
  missing: string[]
}

/**
 * Check that all wizard prerequisites are met:
 * 1. CipherStash authentication exists
 * 2. stash.config.ts exists in the project
 */
export function checkPrerequisites(cwd: string): PrerequisiteResult {
  const missing: string[] = []

  // Check CipherStash auth
  const authPath = resolve(homedir(), '.cipherstash', 'auth.json')
  if (!existsSync(authPath)) {
    missing.push(
      'Not authenticated with CipherStash. Run: npx stash auth login',
    )
  }

  // Check stash.config.ts
  if (!findStashConfig(cwd)) {
    missing.push(
      'No stash.config.ts found. Run: stash db setup',
    )
  }

  return { ok: missing.length === 0, missing }
}

/** Walk up from cwd to find stash.config.ts. */
function findStashConfig(startDir: string): string | undefined {
  let dir = resolve(startDir)
  while (true) {
    const candidate = resolve(dir, 'stash.config.ts')
    if (existsSync(candidate)) return candidate

    const jsCandidate = resolve(dir, 'stash.config.js')
    if (existsSync(jsCandidate)) return jsCandidate

    const parent = resolve(dir, '..')
    if (parent === dir) return undefined
    dir = parent
  }
}
