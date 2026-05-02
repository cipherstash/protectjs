import type { Integration } from '../../commands/init/types.js'
import { loadCorePartial, loadIntegrationPartial } from '../partials.js'
import { RULEBOOK_VERSION } from '../version.js'

export interface ClaudeSkillContext {
  integration: Integration
}

const SKILL_NAME = 'cipherstash-setup'

const SKILL_DESCRIPTION =
  'Complete a CipherStash field-level encryption setup that was started by ' +
  '`stash init`. Reads the prepared context at .cipherstash/context.json, ' +
  'adds encrypted columns to the user-selected schema file, wires the ' +
  'encryption client into the relevant integration (Drizzle / Supabase / ' +
  'plain Postgres), and prepares migrations. Use this skill when the project ' +
  'contains .cipherstash/context.json and the user wants to finish CipherStash setup.'

/**
 * Render the SKILL.md body for a project-local Claude Code skill at
 * `.claude/skills/cipherstash-setup/SKILL.md`.
 *
 * The skill is project-local on purpose: it pins to the rulebook version that
 * `stash init` ran with, so re-running on a different project does not get
 * rules from a different point in time.
 */
export function renderClaudeSkill(ctx: ClaudeSkillContext): string {
  const core = loadCorePartial()
  const integration = loadIntegrationPartial(ctx.integration)
  const frontmatter = [
    '---',
    `name: ${SKILL_NAME}`,
    `description: ${SKILL_DESCRIPTION}`,
    `rulebook_version: ${RULEBOOK_VERSION}`,
    `integration: ${ctx.integration}`,
    '---',
  ].join('\n')

  return [
    frontmatter,
    '',
    `# CipherStash Setup (${ctx.integration})`,
    '',
    'You are completing a CipherStash field-level encryption setup that the user already started with `stash init`. The CLI did the discovery and authentication; your job is to land the code changes the rulebook below describes.',
    '',
    '## First step',
    '',
    '1. Read `.cipherstash/context.json`. If it is missing, stop and tell the user to run `stash init`.',
    `2. Confirm the integration listed in the context matches this skill (\`integration: ${ctx.integration}\`). If it does not, stop and ask the user to re-run \`stash init\`.`,
    '3. Apply the rules below to the file at `context.encryptionClientPath` and any related migration / client wiring.',
    '4. Show the user a diff before applying any database migration.',
    '',
    core.trim(),
    '',
    integration.trim(),
    '',
    '## Done when',
    '',
    '- Encrypted columns from `context.json` are in the schema file with correct types and search ops.',
    '- The encryption client is exported from the path in `context.json`.',
    '- Any new env keys are listed in `.env.example`, and the user knows which values to add to their local `.env`.',
    '- Drizzle / Supabase / Postgres-specific wiring (per the section above) is in place.',
    '- Migrations have been generated but not applied — the user runs them.',
    '',
  ].join('\n')
}

export const CLAUDE_SKILL_NAME = SKILL_NAME
