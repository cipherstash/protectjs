import { cpSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as p from '@clack/prompts'
import type { Integration } from '../types.js'

/**
 * Per-integration set of skills to install. The skills themselves live at
 * the monorepo root in `/skills/<name>/SKILL.md` and ship inside the CLI
 * tarball — see `tsup.config.ts`, which copies the directory into
 * `dist/skills/` at build time.
 *
 * Mirror of the wizard's `SKILL_MAP` (packages/wizard/src/lib/install-skills.ts)
 * extended with `postgresql` and `dynamodb` so init can hand off to those
 * stacks too. Wizard keeps its own copy because it has its own `Integration`
 * union (no `dynamodb`); merging is a separate cleanup.
 */
export const SKILL_MAP: Record<Integration, readonly string[]> = {
  drizzle: ['stash-encryption', 'stash-drizzle', 'stash-cli'],
  supabase: ['stash-encryption', 'stash-supabase', 'stash-cli'],
  postgresql: ['stash-encryption', 'stash-cli'],
  dynamodb: ['stash-encryption', 'stash-dynamodb', 'stash-cli'],
}

/**
 * Copy the per-integration set of skills into `<cwd>/<destDir>/<skill>/`.
 *
 * Unlike the wizard's variant, this does NOT prompt — by the time it runs,
 * the user has already picked a handoff and the skills are part of that
 * choice. Returns the names of skills actually copied.
 *
 * `destDir` is relative to `cwd` and dictates the per-tool location:
 *   `.claude/skills` for Claude Code, `.codex/skills` for Codex.
 *
 * Idempotent: re-runs overwrite the skill folders so the user always gets
 * the latest content shipped with this CLI.
 */
export function installSkills(
  cwd: string,
  destDir: string,
  integration: Integration,
): string[] {
  const skills = SKILL_MAP[integration]
  const bundledRoot = resolveBundledSkillsRoot()
  if (!bundledRoot) {
    p.log.warn(
      'Skills bundle not found in this CLI build — skipping skills install.',
    )
    return []
  }

  const available = skills.filter((name) => existsSync(join(bundledRoot, name)))
  if (available.length === 0) return []

  const destRoot = resolve(cwd, destDir)
  mkdirSync(destRoot, { recursive: true })

  const copied: string[] = []
  for (const name of available) {
    const src = join(bundledRoot, name)
    const dest = join(destRoot, name)
    try {
      cpSync(src, dest, { recursive: true, force: true })
      copied.push(name)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      p.log.warn(`Failed to install skill ${name}: ${message}`)
    }
  }

  return copied
}

/**
 * Read the body of a single bundled skill's SKILL.md. Used by the AGENTS.md
 * builder when the handoff target is an editor agent (Cursor / Windsurf /
 * Cline) that doesn't auto-load skill directories — we inline the content.
 *
 * Returns undefined if the bundle isn't found or the named skill isn't part
 * of the bundle. Callers should treat that as "skip this skill" rather than
 * a fatal error so a stripped CLI build still produces a usable AGENTS.md.
 */
export function readBundledSkill(name: string): string | undefined {
  const bundledRoot = resolveBundledSkillsRoot()
  if (!bundledRoot) return undefined
  const skillFile = join(bundledRoot, name, 'SKILL.md')
  if (!existsSync(skillFile)) return undefined
  return readFileSync(skillFile, 'utf-8')
}

/**
 * Locate the `skills/` directory bundled with this CLI. `tsup` copies the
 * monorepo's top-level `skills/` into `dist/skills/`, so the build sits
 * alongside the compiled binary regardless of where pnpm/npm installs it.
 *
 * Walks up from the current file looking for a sibling `skills` dir so
 * both the library entry (`dist/index.js`) and the CLI entry
 * (`dist/bin/stash.js`) can find it. In dev (running from `src/`) we also
 * fall back to the monorepo root.
 */
function resolveBundledSkillsRoot(): string | undefined {
  const here = currentDir()
  const candidates = [
    join(here, 'skills'),
    join(here, '..', 'skills'),
    join(here, '..', '..', 'skills'),
    join(here, '..', '..', '..', 'skills'),
    // Dev fallback: when running from `packages/cli/src/commands/init/lib/`,
    // the monorepo's `skills/` is six levels up.
    join(here, '..', '..', '..', '..', '..', '..', 'skills'),
  ]
  for (const candidate of candidates) {
    if (existsSync(candidate)) return resolve(candidate)
  }
  return undefined
}

function currentDir(): string {
  if (typeof import.meta?.url === 'string' && import.meta.url) {
    return dirname(fileURLToPath(import.meta.url))
  }
  return __dirname
}
