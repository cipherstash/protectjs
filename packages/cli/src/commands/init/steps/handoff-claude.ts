import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as p from '@clack/prompts'
import { CLAUDE_SKILL_NAME } from '../../../rulebook/index.js'
import { fetchRulebook } from '../lib/fetch-rulebook.js'
import { upsertManagedBlock } from '../lib/sentinel-upsert.js'
import type {
  InitProvider,
  InitState,
  InitStep,
  Integration,
  SchemaDef,
} from '../types.js'
import { detectPackageManager, prodInstallCommand } from '../utils.js'
import { readEnvKeyNames } from './gather-context.js'

const SKILL_REL_PATH = `.claude/skills/${CLAUDE_SKILL_NAME}/SKILL.md`
const CONTEXT_REL_PATH = '.cipherstash/context.json'

interface ContextFile {
  rulebookVersion: string
  cliVersion: string
  integration: Integration
  encryptionClientPath: string
  packageManager: string
  installCommand: string
  envKeys: string[]
  schema: SchemaDef
  generatedAt: string
}

function readCliVersion(): string {
  // package.json sits two levels above the compiled file (dist/) and three
  // levels above the source file. Walk up until we find it. Falling back to
  // 'unknown' is fine — the field is informational.
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

function ensureDir(path: string) {
  const dir = dirname(path)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
}

function writeSkillFile(absPath: string, body: string) {
  const existing = existsSync(absPath)
    ? readFileSync(absPath, 'utf-8')
    : undefined
  const next = upsertManagedBlock({ existing, managed: body })
  ensureDir(absPath)
  writeFileSync(absPath, next, 'utf-8')
}

function writeContextFile(absPath: string, ctx: ContextFile) {
  ensureDir(absPath)
  writeFileSync(absPath, `${JSON.stringify(ctx, null, 2)}\n`, 'utf-8')
}

/**
 * Spawn `claude` interactively in the user's terminal so they can watch tool
 * calls and approve edits. We attach stdio to inherit; this step blocks until
 * the user exits Claude Code.
 *
 * Returns the exit code — 0 means the user finished the session normally,
 * non-zero means `claude` crashed or was interrupted. We don't fail init
 * either way: the artifacts are already written, the user can re-run claude.
 */
function spawnClaude(prompt: string): Promise<number> {
  return new Promise((resolvePromise) => {
    const child = spawn('claude', [prompt], {
      stdio: 'inherit',
      shell: false,
    })
    child.on('close', (code) => resolvePromise(code ?? 0))
    child.on('error', () => resolvePromise(-1))
  })
}

/**
 * Final step on the Claude Code path: write the project skill, write the
 * context file, then either spawn `claude` (handoff='claude-code') or print
 * the next-steps for the user to drive their own agent (handoff='rules-only').
 */
export const handoffClaudeStep: InitStep = {
  id: 'handoff-claude',
  name: 'Hand off to Claude Code',
  async run(state: InitState, _provider: InitProvider): Promise<InitState> {
    const cwd = process.cwd()
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
    const cliVersion = readCliVersion()
    const envKeys = readEnvKeyNames(cwd)

    const rulebookSpinner = p.spinner()
    rulebookSpinner.start('Fetching rulebook...')
    const rulebook = await fetchRulebook({
      integration,
      clientVersion: cliVersion,
    })
    rulebookSpinner.stop(
      rulebook.source === 'gateway'
        ? `Rulebook ${rulebook.rulebookVersion} fetched.`
        : `Rulebook ${rulebook.rulebookVersion} (bundled — gateway unavailable).`,
    )

    const skillAbs = resolve(cwd, SKILL_REL_PATH)
    writeSkillFile(skillAbs, rulebook.skill)
    p.log.success(`Wrote ${SKILL_REL_PATH}`)

    const contextAbs = resolve(cwd, CONTEXT_REL_PATH)
    const ctx: ContextFile = {
      rulebookVersion: rulebook.rulebookVersion,
      cliVersion,
      integration,
      encryptionClientPath: clientFilePath,
      packageManager: pm,
      installCommand: prodInstallCommand(pm, '@cipherstash/stack'),
      envKeys,
      schema,
      generatedAt: new Date().toISOString(),
    }
    writeContextFile(contextAbs, ctx)
    p.log.success(`Wrote ${CONTEXT_REL_PATH}`)

    if (state.handoff === 'rules-only') {
      p.note(
        [
          `Rules installed at ${SKILL_REL_PATH}`,
          `Context at ${CONTEXT_REL_PATH}`,
          '',
          'Point your agent at the skill, or read it directly:',
          `  cat ${SKILL_REL_PATH}`,
        ].join('\n'),
        'Drive your own agent',
      )
      return state
    }

    if (!state.agents?.cli.claudeCode) {
      p.log.warn('`claude` is not on PATH. Skipping spawn.')
      p.note(
        [
          'When you have Claude Code installed, run:',
          `  claude "Use the ${CLAUDE_SKILL_NAME} skill. Context is in ${CONTEXT_REL_PATH}."`,
        ].join('\n'),
        'Manual handoff',
      )
      return state
    }

    p.log.info('Launching Claude Code...')
    const prompt = `Use the ${CLAUDE_SKILL_NAME} skill. Context is in ${CONTEXT_REL_PATH}.`
    const exitCode = await spawnClaude(prompt)
    if (exitCode !== 0) {
      p.log.warn(
        `Claude Code exited with code ${exitCode}. Re-run \`claude "${prompt}"\` to resume.`,
      )
    }

    return state
  },
}
