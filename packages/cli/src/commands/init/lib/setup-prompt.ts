import type { HandoffChoice, InitMode, Integration } from '../types.js'
import { type PackageManager, runnerCommand } from '../utils.js'

export const PLAN_REL_PATH = '.cipherstash/plan.md'

export interface SetupPromptContext {
  integration: Integration
  encryptionClientPath: string
  packageManager: PackageManager
  schemaFromIntrospection: boolean
  eqlInstalled: boolean
  stackInstalled: boolean
  cliInstalled: boolean
  /** Which handoff option the user picked. Lets us tailor wording (e.g. the
   *  Codex prompt names AGENTS.md, Claude names the skill). */
  handoff: HandoffChoice
  /** Whether the agent should produce a plan first or implement directly.
   *  Drives the entire prompt body — plan-mode tells the agent its task is
   *  to produce `.cipherstash/plan.md`; implement-mode is the original
   *  orient-and-route action prompt. */
  mode: InitMode
  /** Names of skills `stash init` copied into the project (e.g.
   *  `stash-encryption`, `stash-drizzle`, `stash-cli`). The action prompt
   *  names them so the agent knows which references to consult. Empty for
   *  the `agents-md` handoff (no skills directory installed) and for
   *  `wizard` (the wizard installs its own). */
  installedSkills: string[]
}

interface MigrationCommands {
  generate: string
  apply: string
  /** Human-readable label for the migration tool ("Drizzle Kit", "Prisma"). */
  tool: string
}

/**
 * Per-integration migration commands. Used in the path-1 (add new encrypted
 * column) walkthrough so the prompt names the exact strings the agent should
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

/**
 * Phrase the "where the rules live" pointer for each handoff target.
 *
 *   claude-code → skills loaded into `.claude/skills/`
 *   codex       → AGENTS.md (durable doctrine) + skills in `.codex/skills/`
 *   agents-md   → AGENTS.md only (Cursor / Windsurf / Cline don't load
 *                 skill directories, so the rules are inlined there)
 *   wizard      → handled separately; this prompt isn't written for wizard
 */
function rulesLocation(handoff: HandoffChoice): string {
  if (handoff === 'claude-code') return '`.claude/skills/`'
  if (handoff === 'codex')
    return '`.codex/skills/` plus durable rules in `AGENTS.md`'
  return '`AGENTS.md` (Cursor / Windsurf / Cline)'
}

/**
 * One-line purpose for each skill so the prompt can introduce them by what
 * they're for, not just by name. Returned in the order the user is most
 * likely to consult them.
 */
const SKILL_PURPOSES: Record<string, string> = {
  'stash-encryption':
    'the encryption API, schema definition, and the column-migration lifecycle (the source of truth for migrating an existing column)',
  'stash-drizzle':
    'Drizzle-specific patterns: declaring encrypted columns, query operators, the migrating-an-existing-column worked example',
  'stash-supabase':
    'Supabase-specific patterns: `encryptedSupabase` wrapper, encrypted query filters, transparent decryption',
  'stash-dynamodb':
    'DynamoDB encryption: per-item encrypt/decrypt, HMAC attribute keys, audit logging',
  'stash-cli':
    '`stash` command reference — `db install`, `encrypt {status,plan,backfill,cutover,drop}`, etc.',
  'stash-secrets':
    'storing and retrieving encrypted secrets (separate concern from column encryption)',
  'stash-supply-chain-security':
    'supply-chain controls (post-install policy, lockfile integrity, etc.)',
}

function renderSkillIndex(installedSkills: string[]): string {
  if (installedSkills.length === 0) {
    return 'No skills were installed (handoff likely wrote AGENTS.md only — read that for the rules).'
  }
  return installedSkills
    .map((name) => {
      const purpose = SKILL_PURPOSES[name] ?? '(no description)'
      return `- **\`${name}\`** — ${purpose}`
    })
    .join('\n')
}

/**
 * Render the project-specific action prompt. Dispatches to the plan-mode or
 * implement-mode renderer based on `ctx.mode`. Both produce the same shape
 * (orient → describe options → tell the agent what its first response is)
 * but the *deliverable* differs: plan-mode writes `.cipherstash/plan.md`,
 * implement-mode edits code and runs lifecycle commands.
 */
export function renderSetupPrompt(ctx: SetupPromptContext): string {
  return ctx.mode === 'plan'
    ? renderPlanPrompt(ctx)
    : renderImplementPrompt(ctx)
}

/**
 * Render the implementation action prompt.
 *
 * This is the file the agent reads first after `stash init` hands off in
 * implement mode. It does NOT prescribe a fixed sequence of edits — the
 * agent doesn't yet know what the user wants. Instead the prompt:
 *
 *   1. Confirms what setup is complete.
 *   2. Names the skills loaded and what each is for.
 *   3. Explains the two real options for encrypting a column (add a new
 *      encrypted column from scratch, or migrate an existing populated
 *      column via the staged-twin lifecycle). In-place conversion is not
 *      supported and called out as such.
 *   4. Tells the agent its FIRST response should be a routing question, not
 *      an action.
 *   5. Lists the "stop and ask" rules that override flow mechanics.
 *
 * If `.cipherstash/plan.md` exists (a previous `stash init --plan` run),
 * the prompt directs the agent to read it first and treat it as the
 * source of truth for routing — the user has already done the
 * orientation pass.
 */
export function renderImplementPrompt(ctx: SetupPromptContext): string {
  const cli = runnerCommand(ctx.packageManager, 'stash')
  const migration = migrationCommands(ctx.integration, ctx.packageManager)

  const done: string[] = [
    checked('Authenticated to CipherStash and selected a workspace'),
    checked(`Detected integration: \`${ctx.integration}\``),
    checked(
      `Wrote a placeholder encryption client at \`${ctx.encryptionClientPath}\` (a small file showing the encryption-client patterns; the user's real Drizzle/Supabase schema files remain authoritative)`,
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
        'Installed the EQL extension and `cipherstash.cs_migrations` into the database',
      ),
    )
  }

  const sections: string[] = [
    '# CipherStash setup — orient and ask',
    '',
    `Integration: \`${ctx.integration}\` · Package manager: \`${ctx.packageManager}\``,
    '',
    '`stash init` has finished its mechanical setup. Your job is **not** to start editing schema or running migrations immediately. Your job is to **orient the user with the two real options for encrypting a column, then ask which one they want before touching anything**. Pick concrete table/column names from `.cipherstash/context.json` when describing the options so the user can recognise their own data.',
    '',
    '## Existing plan',
    '',
    `Before anything else, check whether \`${PLAN_REL_PATH}\` exists. If it does, the user has already done a planning pass with you (or another agent). Read it as the source of truth for which path applies, which tables/columns are in scope, and the deploy ordering — do not re-ask the routing question. Confirm with the user that the plan is still current, then execute it. If the plan looks stale (the schema or context has moved on), say so and propose specific updates rather than starting fresh.`,
    '',
    `If \`${PLAN_REL_PATH}\` does **not** exist, proceed with the orient-and-route flow below.`,
    '',
    '## What `stash init` already did',
    '',
    ...done,
    '',
    '## Skills loaded',
    '',
    `Reusable rules and worked examples live in ${rulesLocation(ctx.handoff)}:`,
    '',
    renderSkillIndex(ctx.installedSkills),
    '',
    'Read the skills before answering API or pattern questions. The doctrine in `AGENTS.md` (or its inlined equivalent) covers the invariants that apply regardless of which flow you take — never log plaintext, never `.notNull()` on creation, etc.',
    '',
    '## The two options',
    '',
    "There are exactly two supported ways to encrypt a column. Recognise which one applies to the user's request before doing anything.",
    '',
    '### Add a new encrypted column',
    '',
    'Use when the column **does not yet exist** in the database (no plaintext predecessor to preserve). This is normal Drizzle / Supabase work plus the encryption client patterns from the integration skill.',
    '',
    "1. **If this is the first encrypted column in the project, configure the bundler exclusion first.** `@cipherstash/stack` cannot be bundled (it wraps a native FFI module). Next.js: add `serverExternalPackages: ['@cipherstash/stack', '@cipherstash/protect-ffi']` to `next.config.*`. Webpack: `externals`. esbuild: `external`. Vite SSR: `ssr.external`. Without this, the encryption client crashes at runtime with `Cannot find module '@cipherstash/protect-ffi-*'`. See the `stash-encryption` skill's Installation section for the full snippets.",
    "2. Edit the user's real schema file (`src/db/schema.ts` or wherever they keep it) to declare the new encrypted column. Use the patterns in the integration skill — `encryptedType` for Drizzle, `encryptedColumn` for Supabase. Encrypted columns must be **nullable `jsonb`** at creation time. Never `.notNull()`.",
    `3. Generate the schema migration${migration ? ` — \`${migration.generate}\` (${migration.tool})` : " using the project's existing migration tooling"}.`,
    `4. Show the user the generated SQL before applying${migration ? ` — \`${migration.apply}\`` : ''}.`,
    `5. Register the encryption config — \`${cli} db push\`. If the project has no active EQL config yet (first encrypted column ever), this writes directly to active and you can skip step 6. If an active config already exists, push writes \`pending\` and prints a next-step note.`,
    `6. **If db push wrote pending**, promote it to active — \`${cli} db activate\`. (Use \`${cli} db activate\` here because no rename is needed; \`${cli} encrypt cutover\` is reserved for the migrate-existing-column flow.)`,
    '7. Wire the column through the application code: insert paths encrypt before write, select paths decrypt after read, query paths use the right operator (`protectOps.eq`, etc. — see the integration skill).',
    '8. Verify with a round-trip: insert a record, select it back, confirm the value decrypts and the search ops work.',
    '',
    '### Migrate an existing column to encrypted',
    '',
    "Use when the column **already exists** in the user's database and contains live data that must be preserved.",
    '',
    "Why it's staged: there is no atomic way to replace a populated column with an encrypted one without corrupting data. Instead the lifecycle adds a parallel `<col>_encrypted` twin, dual-writes from the app while existing rows are backfilled, then renames the twin into the original column name and drops the old plaintext. The `stash encrypt` CLI commands drive each step; the `stash-encryption` skill has the full model.",
    '',
    "1. **Schema-add.** Add an `<col>_encrypted` twin column (nullable `jsonb`) alongside the existing plaintext column in the user's real schema file. Generate and apply the schema migration. **If this is the first encrypted column in the project, configure the bundler exclusion now** — see the snippets in the previous section. Without it, importing the encryption client at backfill time will crash.",
    `2. **Register pending config** — \`${cli} db push\`. With an existing active config, this writes the new column-set as \`pending\`. Cutover (step 5) will promote it. (If this is the very first push for the project, db push writes active directly — fine, the rest of the flow still works.)`,
    '3. **Dual-write.** Edit the application code so every insert/update writes to *both* `<col>` (plaintext, unchanged) and `<col>_encrypted` (ciphertext via the encryption client). Reads still come from the plaintext column. Ship that code change.',
    `4. **Backfill.** Run \`${cli} encrypt backfill --table <T> --column <c>\`. The CLI prompts the user (or accepts \`--confirm-dual-writes-deployed\` non-interactively) to confirm dual-writes are live, then chunks through the existing rows. Resumable; checkpoints to \`cs_migrations\` after every chunk. SIGINT-safe.`,
    `5. **Switch the schema and re-push, then cutover.** Update the schema file to declare the encrypted column under its final name (drop \`_encrypted\` suffix, switch \`<col>\` to \`encryptedType\`). Run \`${cli} db push\` again — pending now reflects the renamed shape. Then \`${cli} encrypt cutover --table <T> --column <c>\` runs the rename in one transaction (\`<col>\` → \`<col>_plaintext\`, \`<col>_encrypted\` → \`<col>\`) and promotes pending → active.`,
    '6. **Wire the read path through the encryption client.** Post-cutover, `<col>` holds ciphertext. Read code paths must decrypt before returning the value to callers — `decryptModel(row, table)` for Drizzle, the `encryptedSupabase` wrapper for Supabase, or the equivalent `decrypt`/`bulkDecryptModels` calls. Without this step, your read paths return raw `eql_v2_encrypted` payloads to end users. The integration skill has the exact API.',
    '7. **Remove the dual-write code.** The plaintext column is now `<col>_plaintext` and is no longer authoritative. Delete the dual-write logic from the persistence layer.',
    `8. **Drop.** Run \`${cli} encrypt drop --table <T> --column <c>\`. Generates a migration that removes the now-unused \`<col>_plaintext\`. Apply with the project's normal migration tooling.`,
    '',
    'Recovery: if the user reports that backfill ran *before* the dual-write code was actually live, drift is expected (rows written during the backfill window land in plaintext only). Re-run with `--force` to encrypt every plaintext row regardless of current state.',
    '',
    '### Converting in place is not supported',
    '',
    'There is no supported way to drop a populated plaintext column and replace it with an encrypted column atomically — any "just swap the type" approach corrupts data or loses constraints. If the user asks for that, explain why it doesn\'t work and route them to the migrate-existing-column flow above. The only situation where you can clobber a column without staging is when there is genuinely no data to preserve, which is just the add-new-column flow.',
    '',
    '## Your first response',
    '',
    'Before any edits, send the user a short orientation message. Confirm setup is complete, list the skills loaded with one-line purposes, summarise the two options in your own words, and end with a clear question — *"Which would you like to do? You can name a specific table+column or describe what you\'re trying to protect."* Reference concrete tables/columns from `.cipherstash/context.json` when it helps.',
    '',
    'Once the user answers, execute the relevant flow. Show diffs / generated SQL before applying. Pause for review at every database-mutating step.',
    '',
    '## Stop and ask the user when',
    '',
    bullet(
      "The user asks to convert a populated column in place. Explain why it doesn't work and offer the migrate-existing-column flow instead.",
    ),
    bullet(
      "A column the user names is already encrypted (`eql_v2_encrypted` udt) but with a different EQL config than they've described. This is the post-cutover re-encryption case (`stash encrypt update`, not yet shipped) — surface it instead of guessing.",
    ),
    bullet(
      'The schema migration would change the data type of a column the user has already filled.',
    ),
    bullet(
      'You discover existing partial CipherStash setup that disagrees with what the user is describing — someone else may have run `stash init` earlier with different choices.',
    ),
    '',
  ]

  return sections.join('\n')
}

/**
 * Render the planning action prompt.
 *
 * Plan-mode tells the agent its task is to produce a reviewable plan file
 * at `.cipherstash/plan.md` — no schema edits, no migrations, no `db push`,
 * no `encrypt *` mutations during this phase. Read-only inspection
 * (`stash db status`, schema grep, file reads) is fine.
 *
 * The plan covers: which table(s) and column(s) to protect, which
 * lifecycle path applies per column (path 1 = new column / path 3 =
 * migrate existing), the deploy ordering for path-3 columns, any
 * project-specific risks, and the exact CLI sequence to execute when the
 * user is ready to implement.
 */
export function renderPlanPrompt(ctx: SetupPromptContext): string {
  const cli = runnerCommand(ctx.packageManager, 'stash')

  const done: string[] = [
    checked('Authenticated to CipherStash and selected a workspace'),
    checked(`Detected integration: \`${ctx.integration}\``),
    checked(
      `Wrote a placeholder encryption client at \`${ctx.encryptionClientPath}\` (a small file showing the encryption-client patterns; the user's real Drizzle/Supabase schema files remain authoritative)`,
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
        'Installed the EQL extension and `cipherstash.cs_migrations` into the database',
      ),
    )
  }

  const sections: string[] = [
    '# CipherStash setup — write a plan',
    '',
    `Integration: \`${ctx.integration}\` · Package manager: \`${ctx.packageManager}\``,
    '',
    `\`stash plan\` runs the planning phase — your job is to produce a reviewable plan at \`${PLAN_REL_PATH}\`, **not** to make schema or code changes. Read-only inspection (\`${cli} db status\`, reading schema files, grepping the codebase) is encouraged. Schema edits, migrations, \`${cli} db push\`, and any \`${cli} encrypt *\` mutations are deferred to \`${cli} impl\`, which the user will run after reviewing and approving the plan.`,
    '',
    '## What `stash init` already did',
    '',
    ...done,
    '',
    '## Skills loaded',
    '',
    `Reusable rules and worked examples live in ${rulesLocation(ctx.handoff)}:`,
    '',
    renderSkillIndex(ctx.installedSkills),
    '',
    'Read the skills before answering API or pattern questions. The doctrine in `AGENTS.md` (or its inlined equivalent) covers the invariants that apply regardless of which flow you take — never log plaintext, never `.notNull()` on creation, etc.',
    '',
    '## The two options',
    '',
    'There are exactly two supported ways to encrypt a column. The plan must identify which one applies per column:',
    '',
    '- **Add a new encrypted column** — the column does not yet exist; no plaintext predecessor to preserve. Single-deploy.',
    '- **Migrate an existing column** — the column already exists with live data. Staged across four deploys: schema-add + dual-write → backfill run → cutover + read-from-encrypted → drop. The lifecycle is irreducible; the plan must spell out the deploy ordering so reviewers can sequence PRs correctly.',
    '',
    'Converting a populated column in place is **not** supported — any "just swap the type" approach corrupts data. If the user asks for that, the plan must explain why and route them to the migrate-existing flow.',
    '',
    '## Your task: produce a plan file',
    '',
    `Write \`${PLAN_REL_PATH}\` covering, for each table+column the user wants to protect:`,
    '',
    bullet(
      '**A machine-readable summary block at the very top of the file**, before any heading or prose. `stash impl` parses this to render a confirmation panel before launching implementation. Use this exact shape (valid JSON, single block, no other content inside the comment):',
    ),
    '',
    '  ```',
    '  <!-- cipherstash:plan-summary',
    '  {',
    '    "columns": [',
    '      {"table": "<table_name>", "column": "<column_name>", "path": "new" | "migrate"}',
    '    ]',
    '  }',
    '  -->',
    '  ```',
    '',
    `  \`path\` is \`"new"\` for additive columns (no plaintext predecessor) and \`"migrate"\` for columns that already exist with live data. The block must remain in sync with the prose that follows; if you revise the plan, regenerate the summary.`,
    '',
    'Then, the prose plan covers:',
    '',
    bullet(
      "The table and column names (extract candidates from `.cipherstash/context.json`; if the user hasn't yet said which columns matter, ask before writing the plan).",
    ),
    bullet(
      'Which lifecycle path applies (path 1 = add new / path 3 = migrate existing). Justify briefly — the user should be able to verify the choice without reading the skill.',
    ),
    bullet(
      'For path-3 columns: the four-deploy sequence with one line per deploy on what changes (schema, app code, lifecycle command). Call out which step the deploy gates on (e.g. "deploy 2 must wait until deploy 1 is live in production before backfill is safe").',
    ),
    bullet(
      `Project-specific risks. Common ones: bundler exclusion not yet configured (Next.js / webpack / Vite), top-level-await in the placeholder encryption client breaks non-Next contexts, existing partial CipherStash state (run \`${cli} db status\` and note any pre-existing encrypted columns or pending configs).`,
    ),
    bullet(
      `The exact CLI sequence to execute when the user is ready to implement (the \`${cli} encrypt {backfill,cutover,drop}\` invocations with concrete \`--table\` / \`--column\` values).`,
    ),
    bullet(
      "Open questions for the user — anything you can't determine from the schema, context.json, or the skills. Better to surface than guess.",
    ),
    '',
    `After writing the plan, also offer to copy it into \`docs/plans/cipherstash-encryption.md\` if the project has a \`docs/plans/\` directory — many teams version their plans alongside the code. Don't copy without asking. If \`docs/plans/\` does not exist, leave the plan at \`${PLAN_REL_PATH}\` and don't create the directory.`,
    '',
    '## What you must NOT do',
    '',
    bullet(
      'Edit schema files, application code, or migration files. The plan describes future changes — it does not perform them.',
    ),
    bullet(
      `Run \`${cli} db push\`, \`${cli} encrypt backfill\`, \`${cli} encrypt cutover\`, \`${cli} encrypt drop\`, \`${cli} db activate\`, or any other state-mutating command.`,
    ),
    bullet(
      'Run schema migrations (`drizzle-kit migrate`, `supabase migration up`, `prisma migrate`, etc.).',
    ),
    bullet(
      'Modify the placeholder encryption client beyond what is required to read it.',
    ),
    '',
    `Read-only commands (\`${cli} db status\`, file reads, greps, \`${cli} doctor\` if available) are fine and encouraged — the plan is more useful when grounded in the actual current state.`,
    '',
    '## Your first response',
    '',
    `Send the user a short orientation message before writing anything. Confirm setup is complete, list the skills loaded with one-line purposes, summarise the two options in your own words, and end with a clear question — *"Which table(s) and column(s) would you like the plan to cover? You can name them or describe what you're trying to protect."* Reference concrete tables/columns from \`.cipherstash/context.json\` when it helps.`,
    '',
    `Once the user answers, write \`${PLAN_REL_PATH}\`. Show the plan in chat as well so the user can react inline. After the plan is approved, tell the user to run \`${cli} impl\` to execute it.`,
    '',
    '## Stop and ask the user when',
    '',
    bullet(
      "The user asks to convert a populated column in place. Explain why it doesn't work and offer the migrate-existing-column flow instead.",
    ),
    bullet(
      "A column the user names is already encrypted (`eql_v2_encrypted` udt) but with a different EQL config than they've described. This is the post-cutover re-encryption case (`stash encrypt update`, not yet shipped) — surface it in the plan as a flagged risk.",
    ),
    bullet(
      'You discover existing partial CipherStash setup that disagrees with what the user is describing — someone else may have run `stash init` earlier with different choices. Note this in the plan and ask the user to clarify before writing prescriptive steps.',
    ),
    bullet(
      "The user names columns that don't appear in `.cipherstash/context.json` or in the schema files you can see. Confirm the names rather than guessing.",
    ),
    '',
  ]

  return sections.join('\n')
}
