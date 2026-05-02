import { spawnSync } from 'node:child_process'
import { existsSync, statSync } from 'node:fs'
import { resolve } from 'node:path'

export type Editor = 'vscode' | 'cursor' | 'unknown'

export interface AgentEnvironment {
  cli: {
    /** `claude` is on PATH. */
    claudeCode: boolean
    /** `codex` is on PATH. */
    codex: boolean
  }
  project: {
    /** A `.claude/` directory exists at the project root. */
    claudeDir: boolean
    /** A `CLAUDE.md` file exists at the project root. */
    claudeMd: boolean
    /** A `.claude/skills/` directory exists at the project root. */
    claudeSkillsDir: boolean
    /** An `AGENTS.md` file exists at the project root. */
    agentsMd: boolean
  }
  /** Which editor is hosting the current terminal, if recognisable. */
  editor: Editor
}

/**
 * Look up an executable on PATH without running it. We use `command -v` (POSIX)
 * because it is built into every shell we support and prints a usable path on
 * success / nothing on failure. `which` is not always installed on minimal
 * containers; `command -v` is.
 */
function isOnPath(bin: string): boolean {
  // `command -v` is a shell builtin, so we run it via /bin/sh -c with the
  // command argument inlined. Avoids the DEP0190 warning that fires when you
  // combine `shell: true` with an args array.
  if (!/^[a-z0-9_-]+$/i.test(bin)) return false
  const result = spawnSync('/bin/sh', ['-c', `command -v ${bin}`], {
    stdio: ['ignore', 'pipe', 'ignore'],
  })
  if (result.status !== 0) return false
  const out = result.stdout?.toString().trim() ?? ''
  return out.length > 0
}

function detectEditor(env: NodeJS.ProcessEnv): Editor {
  if (env.CURSOR_TRACE_ID) return 'cursor'
  if (env.TERM_PROGRAM === 'vscode') return 'vscode'
  return 'unknown'
}

function isDirectory(path: string): boolean {
  if (!existsSync(path)) return false
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}

/**
 * Detect available coding agents and editor context.
 *
 * `cwd` and `env` are injected so tests can mock them; production callers can
 * use the no-arg form.
 */
export function detectAgents(
  cwd: string = process.cwd(),
  env: NodeJS.ProcessEnv = process.env,
): AgentEnvironment {
  return {
    cli: {
      claudeCode: isOnPath('claude'),
      codex: isOnPath('codex'),
    },
    project: {
      claudeDir: isDirectory(resolve(cwd, '.claude')),
      claudeMd: existsSync(resolve(cwd, 'CLAUDE.md')),
      claudeSkillsDir: isDirectory(resolve(cwd, '.claude', 'skills')),
      agentsMd: existsSync(resolve(cwd, 'AGENTS.md')),
    },
    editor: detectEditor(env),
  }
}

/**
 * Convenience predicate. The handoff offer in the init flow wants to know
 * "should we default to Claude Code?", which collapses CLI presence + any
 * project-level Claude artifact into a single yes/no.
 */
export function shouldOfferClaudeCode(env: AgentEnvironment): boolean {
  return env.cli.claudeCode
}
