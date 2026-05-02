import type { Integration } from '../../commands/init/types.js'
import { loadCorePartial, loadIntegrationPartial } from '../partials.js'
import { RULEBOOK_VERSION } from '../version.js'

export interface AgentsMdContext {
  integration: Integration
}

/**
 * Render the `AGENTS.md` body that lives at the project root.
 *
 * `AGENTS.md` is the convention used by Codex CLI, ChatGPT Codex (cloud),
 * Cursor (as a fallback), Windsurf, Cline, and most other coding agents that
 * are not Claude Code. They all read it from the repo root automatically.
 *
 * Unlike the Claude Code skill body, AGENTS.md is plain markdown — no YAML
 * frontmatter. The CLI wraps the rendered body in sentinel markers
 * (`<!-- cipherstash:rulebook start/end -->`) before writing, so re-runs
 * upsert in place and any user-authored content outside the block is
 * preserved.
 */
export function renderAgentsMd(ctx: AgentsMdContext): string {
  const core = loadCorePartial()
  const integration = loadIntegrationPartial(ctx.integration)

  return [
    `# CipherStash Setup (${ctx.integration})`,
    '',
    `Rulebook version: ${RULEBOOK_VERSION}`,
    '',
    'You are completing a CipherStash field-level encryption setup that the user already started with `stash init`. The CLI did the discovery and authentication; your job is to land the code changes the rulebook below describes.',
    '',
    '## First step',
    '',
    '1. Read `.cipherstash/context.json`. If it is missing, stop and tell the user to run `stash init`.',
    `2. Confirm the integration listed in the context matches this rulebook (\`integration: ${ctx.integration}\`). If it does not, stop and ask the user to re-run \`stash init\`.`,
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
