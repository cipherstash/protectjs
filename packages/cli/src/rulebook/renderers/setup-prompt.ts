import type {
  HandoffChoice,
  Integration,
  SchemaDef,
} from '../../commands/init/types.js'
import {
  type PackageManager,
  runnerCommand,
} from '../../commands/init/utils.js'
import { RULEBOOK_VERSION } from '../version.js'

export interface SetupPromptContext {
  integration: Integration
  encryptionClientPath: string
  packageManager: PackageManager
  schema: SchemaDef
  schemaFromIntrospection: boolean
  eqlInstalled: boolean
  stackInstalled: boolean
  cliInstalled: boolean
  /** Which handoff option the user picked. Lets us tailor wording (e.g. the
   *  Codex prompt names AGENTS.md, Claude names the skill). */
  handoff: HandoffChoice
}

interface MigrationCommands {
  generate: string
  apply: string
  /** Human-readable label for the migration tool ("Drizzle Kit", "Prisma"). */
  tool: string
}

/**
 * Per-integration migration commands. We compute these from the detected
 * package manager + integration so the agent gets the exact string it should
 * run, not a generic "run your migrations" hand-wave.
 */
function migrationCommands(
  integration: Integration,
  pm: PackageManager,
): MigrationCommands | undefined {
  if (integration === 'drizzle') {
    return {
      tool: 'Drizzle Kit',
      generate: `${execCommand(pm)} drizzle-kit generate`,
      apply: `${execCommand(pm)} drizzle-kit migrate`,
    }
  }
  if (integration === 'supabase') {
    return {
      tool: 'Supabase CLI',
      generate: 'supabase migration new <name>',
      apply: 'supabase migration up (remote) or supabase db reset (local)',
    }
  }
  return undefined
}

/**
 * Map the package manager to the right "run a binary from node_modules" form.
 *   npm  → `npx --no-install` (avoid surprise downloads when the dep should
 *           already be installed)
 *   pnpm → `pnpm exec`
 *   yarn → `yarn` (yarn 1) or `yarn run` — `yarn <bin>` works for both
 *   bun  → `bun x` (binary-runner mode, not the dlx alias)
 */
function execCommand(pm: PackageManager): string {
  switch (pm) {
    case 'npm':
      return 'npx --no-install'
    case 'pnpm':
      return 'pnpm exec'
    case 'yarn':
      return 'yarn'
    case 'bun':
      return 'bun x'
  }
}

function bullet(line: string): string {
  return `- ${line}`
}

function checked(line: string): string {
  return `- [x] ${line}`
}

function todo(line: string): string {
  return `- [ ] ${line}`
}

/**
 * Render the project-specific action prompt.
 *
 * This is the file the agent reads first — it tells them exactly what state
 * the project is in, what's already done, and what to do next, with concrete
 * paths and commands. The skill / AGENTS.md provides reusable rules; this
 * file is the imperative for *this run*.
 *
 * Structure: header → "what's done" checklist → "what's next" actionable list
 * → reference to the skill/AGENTS.md for the rules.
 */
export function renderSetupPrompt(ctx: SetupPromptContext): string {
  const cli = runnerCommand(ctx.packageManager, 'stash')
  const migration = migrationCommands(ctx.integration, ctx.packageManager)

  const done: string[] = [
    checked('Authenticated to CipherStash and selected a workspace'),
    checked(`Detected integration: \`${ctx.integration}\``),
    checked(
      `Wrote the encryption client to \`${ctx.encryptionClientPath}\` (${
        ctx.schemaFromIntrospection
          ? 'sourced from live database introspection'
          : "PLACEHOLDER schema — not yet aligned to the user's real data model"
      })`,
    ),
  ]
  if (ctx.stackInstalled) {
    done.push(checked('Installed `@cipherstash/stack` (runtime)'))
  }
  if (ctx.cliInstalled) {
    done.push(checked('Installed `stash` (CLI, dev dep)'))
  }
  if (ctx.eqlInstalled) {
    done.push(
      checked(
        'Installed the EQL extension into the database (`stash db install`)',
      ),
    )
  }

  const next: string[] = []

  if (!ctx.eqlInstalled) {
    next.push(
      todo(
        `**Install EQL into the database** — run \`${cli} db install\`. This is required before any migration that creates encrypted columns.`,
      ),
    )
  }

  if (!ctx.schemaFromIntrospection) {
    next.push(
      todo(
        `**Reshape the encryption client.** \`${ctx.encryptionClientPath}\` currently uses a placeholder \`users\` table with \`email\` and \`name\` columns. Read the user's existing schema (probably under \`src/db/\` or similar for ${ctx.integration}), decide which real tables and columns should be encrypted, and update the encryption client to match. Refer to the integration rules for the column types and constraints to use.`,
      ),
    )
  }

  if (ctx.integration === 'drizzle') {
    next.push(
      todo(
        `**Wire the encryption client into Drizzle config.** Make sure \`drizzle.config.ts\`'s \`schema\` field includes the encryption client file so \`drizzle-kit generate\` picks up the encrypted columns. If the user keeps a single \`schema.ts\`, re-export the table definitions from there instead.`,
      ),
    )
  }

  if (ctx.integration === 'supabase') {
    next.push(
      todo(
        '**Wrap the Supabase client.** Find every call to `createClient` / `createServerClient` / `createBrowserClient` from `@supabase/supabase-js` or `@supabase/ssr`. Wrap each with `encryptedSupabase({ encryptionClient, supabaseClient })` from `@cipherstash/stack/supabase` (see the rulebook for the exact API).',
      ),
    )
  }

  if (migration) {
    next.push(
      todo(
        `**Generate the migration** — \`${migration.generate}\` (${migration.tool}). Verify the generated SQL declares encrypted columns as nullable \`jsonb\`. Never \`NOT NULL\` on creation.`,
      ),
    )
    next.push(
      todo(
        `**Apply the migration** — \`${migration.apply}\`. Show the user the generated SQL before running.`,
      ),
    )
  } else {
    next.push(
      todo(
        '**Generate and apply a migration** that adds the encrypted columns as nullable `jsonb`. The exact tooling depends on the project — pick the one already in use.',
      ),
    )
  }

  next.push(
    todo(
      '**Verify with a round-trip.** Insert a record through the encryption client, select it back, confirm the value decrypts and the search ops work as expected.',
    ),
  )

  const ruleSource =
    ctx.handoff === 'claude-code'
      ? 'the `cipherstash-setup` skill (already loaded — `.claude/skills/cipherstash-setup/SKILL.md`)'
      : 'the `AGENTS.md` at the project root'

  return [
    '# CipherStash setup — action plan',
    '',
    `Rulebook version: ${RULEBOOK_VERSION}`,
    `Integration: ${ctx.integration}`,
    `Package manager: ${ctx.packageManager}`,
    '',
    `You are picking up a CipherStash setup that \`stash init\` has started. Read this file in full before touching anything. Project-specific facts live in \`.cipherstash/context.json\`. Reusable rules (column types, things never to touch, never-\`.notNull()\`-on-encrypted etc.) live in ${ruleSource}.`,
    '',
    '## What `stash init` already did',
    '',
    ...done,
    '',
    '## What you need to do',
    '',
    ...next,
    '',
    '## Stop and ask the user when',
    '',
    bullet(
      'Schema reshaping involves dropping or renaming a column with existing data — this needs a backfill plan, not a rename.',
    ),
    bullet(
      'You discover existing encrypted columns that disagree with the encryption client — someone else may have run `stash init` earlier with different choices.',
    ),
    bullet(
      'A migration would change the data type of a column the user has already filled.',
    ),
    '',
  ].join('\n')
}
