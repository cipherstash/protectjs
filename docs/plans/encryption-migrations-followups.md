# Encryption migrations — follow-up items

Cross-PR follow-ups accumulated while building PR #357 (`stash encrypt *`,
`@cipherstash/migrate`) and the post-#395 init/handoff work that led into it.
Persisted here so context compaction doesn't lose them. Categorised by area.

Last updated: after commit `f0361aa` (`fix(cli, migrate): wire EQL
pending/active state machine for cutover`).

---

## 1. Skills coverage

### 1.1. `stash-supabase` skill — "migrating an existing column" worked example

Mirror the section we added to `stash-drizzle/SKILL.md`. Same six-phase walkthrough but in Supabase terms: schema declaration with `encryptedColumn` + `encryptedTable`, schema migration via `supabase migration new`, dual-writes through the `encryptedSupabase` wrapper, the lifecycle commands, and the post-cutover schema shape.

**Why it matters:** Drizzle users now have a concrete recipe; Supabase users still have to mentally translate from the generic `stash-encryption` skill. This is the most-requested integration after Drizzle.

### 1.2. Codex-style procedural skill structure

Per OpenAI's Codex guidance, skills can include `scripts/` (executable inspection helpers) and `references/` (deeper API docs). Our skills are SKILL.md-only today. Concrete additions worth scoping:

- `scripts/detect-stack.ts` — detect Drizzle / Supabase / Prisma / etc.
- `scripts/find-pii-columns.ts` — heuristic for "what columns probably hold PII"
- `scripts/inspect-schema.ts` — read user's schema files, list candidate columns
- `references/protect-js-api.md` — full API reference, deeper than what fits in the SKILL summary
- `references/postgres-migration-patterns.md` — common shapes for ORM-emitted migrations

These are most valuable for Codex (which operates more procedurally) but also useful for Claude.

### 1.3. `stash-secrets` and `stash-supply-chain-security` skills auto-install

Currently the per-integration `SKILL_MAP` in `install-skills.ts` only installs the integration-specific subset. `stash-secrets` (encrypted secrets management) and `stash-supply-chain-security` (npm controls) are valuable but orthogonal — not auto-installed today.

Options:

1. Add to every integration's set automatically.
2. Offer as a follow-up prompt after the base install (`Also install secrets / supply-chain skills?`).

Option 2 keeps the install scope minimal and avoids giving Claude a 3000-line context dump it doesn't need most of the time.

### 1.4. Skill restructuring for agent token economy

**Severity: medium** — improves agent efficiency. Surfaced by the 2026-05-04 spike feedback.

The 2026-05-04 path-3 spike loaded `stash-encryption`, `stash-drizzle`, and `stash-cli` in their entirety at session start (~600+ combined lines). In practice ~30% was load-bearing for the migrate-existing flow; the rest paid context rent for no benefit. Front-loading three full SKILL.md files is the single largest avoidable token cost the agent reported.

Three options, in increasing scope:

1. **Inline a tight migrate-existing-column quick reference into the setup-prompt itself** — the steps + the exact `stash encrypt *` invocations, ~40 lines. Agents working a known path can act without loading the skills at all; agents that need depth can still pull them on demand. Lowest friction, ships soonest.
2. **Split each skill into overview + per-task pages** (`stash-encryption/SKILL.md` overview + `stash-encryption/lifecycle.md`, `stash-drizzle/SKILL.md` overview + `stash-drizzle/migrate-existing-column.md`). Lets the skill loader install the overview by default and have the agent fetch task pages as needed. Higher effort, scales better as we add more flows.
3. **Restructure each skill so the first ~100 lines cover the 80% case** with details deferred. Cheapest of the three but doesn't change the loading cost — only the skim cost. Useful as a baseline regardless of (1)/(2).

Recommended: ship (1) for immediate impact (and it dovetails with the orient-and-route prompt structure the setup-prompt already uses); track (2) as a larger restructure follow-up; do (3) opportunistically as we touch each skill.

---

## 2. Wizard alignment

### 2.1. Wizard gateway prompt template

The wizard is one of the four handoff options at `stash init` (`stash wizard` / `@cipherstash/wizard`). It fetches its prompt from the gateway (`wizard.getstash.sh`) rather than reading the local skills. The setup-prompt rewrite we did for Claude/Codex (orient + route between path 1 and path 3, name the lifecycle commands) hasn't propagated to the wizard's gateway prompt.

To do:

- Update the gateway prompt template to teach the wizard the orient-and-route shape.
- Render the prompt from the same source content as the local skills/setup-prompt where possible — diverging templates will drift.

### 2.2. Wizard tool surface for `stash encrypt *`

Verify the wizard can shell out to `stash encrypt backfill / cutover / drop / db push / db activate` from inside its session. If it has a generic `runCli` tool, this is free. If not, add one — the wizard needs to drive the same lifecycle as the agent handoff.

### 2.3. Wizard UX improvements (general)

We flagged earlier that the wizard "kinda works but needs improvement in follow-ups". Loose ends to scope:

- More directive prompts (the wizard's UX is more menu-driven than the conversational agents).
- Better progress indication during long-running steps (backfill, etc.).
- Clearer error surfacing.

---

## 3. CLI / library

### 3.1. `stash encrypt update` — re-encrypt after EQL config change

Deferred explicitly, called out in the changeset and the plan doc. Use case: the column has already been cut over (encrypted column live in production), and the user changes the encryption configuration (e.g. key rotation, adding a new index op like `freeTextSearch`). Existing rows need to be re-encrypted with the new config.

Mechanics: source = the existing encrypted column itself. Decrypt with old config, re-encrypt with new config, write back. Different from `backfill --force` because the source IS the encrypted column, not a plaintext predecessor.

### 3.2. Smarter `db push` — auto-activate purely additive changes

Today: `db push` writes pending whenever an active config exists, requiring the user to run a follow-up command (`db activate` or `encrypt cutover`). For the common "I'm just registering a new encrypted column" case, the pending → active dance is unnecessary friction.

Future: detect whether the new config is purely additive (every active column-config still present and unchanged in the new config; any difference is just new columns). If so, write directly to active. Otherwise, write pending and require explicit activation.

The `eql_v2.diff_config()` SQL function may already give us enough information.

### 3.3. `loadStashConfig` re-export from `@cipherstash/migrate`

Library consumers of `@cipherstash/migrate` (embedding backfill in their own workers / cron) currently have to import `loadStashConfig` from `stash` separately, which is a hidden cross-package dependency. Either:

1. Re-export `loadStashConfig` from `@cipherstash/migrate` (simplest).
2. Move the config loader to a shared package that both `stash` and `@cipherstash/migrate` consume.

(1) is fine for Phase 1; (2) is cleaner long-term.

### 3.4. Composite primary keys in backfill

The current backfill code throws clearly when it detects a composite PK (`detectPkColumn` in `backfill.ts:362`). Composite-PK support requires reshaping the cursor logic to keyset-paginate on tuples, not single columns. Real but not urgent — Drizzle / Supabase both default to single-column PKs.

### 3.5. `stash encrypt drop` for Prisma / raw-SQL projects

Today only emits Drizzle-shaped migration files. Prisma and raw-SQL paths are planned per the docstring. Detect the project's migration tooling and emit the right shape.

### 3.6. Integration tests for the new pending/active flow

The migrate package has integration tests against a real Postgres but they're currently `describe.skipIf(!POSTGRES_URL_FOR_TESTS)`. After the state-machine wiring landed, we should add coverage for:

- `db push` first time (writes active).
- `db push` second time (writes pending, leaves active).
- `cutover` (rename + migrate + activate).
- `db activate` (no-rename case).
- Round-trip: backfill → cutover with the new flow.

### 3.7. Deploy-ordering safeguards for the migrate-existing-column flow

The migrate-existing-column flow spans four logical deploys (schema-add + dual-write → backfill run → cutover + read-from-encrypted → drop). If a developer ships a `DROP COLUMN <col>_plaintext` migration before cutover has actually applied on the target environment, the plaintext is gone and the encrypted column has no rows yet — silent data loss. The CLI commands themselves guard each transition (e.g. `encrypt drop` refuses unless phase is `cut-over`), but once the migration file is written it sits in `drizzle/` and can be applied at any time, on any environment, by any deploy. A hand-written `DROP COLUMN` bypasses the CLI entirely.

Three layers of defence, all worth shipping:

**(a) Self-guarding generated SQL.** Wrap the generated drop in a `DO $$ ... END $$` block that reads `cipherstash.cs_migrations` on the database it runs against and aborts if the column hasn't reached `cut-over` *on this database*. Same idempotent shape as the cutover migration already uses (check column exists first, no-op if already dropped). Cheapest big win — defends against migration-shipped-too-early in any environment, including CI/staging that the CLI never touched. Symmetric guard worth adding to the cutover migration too. ~15 lines in `drop.ts` plus a similar tweak to `cutover.ts`'s `buildRenameMigrationSql`.

**(b) Postgres event trigger** (opt-in via `db install --strict-drop-protection` or a config flag). `ddl_command_start` event trigger that intercepts ALTER TABLE ... DROP COLUMN and refuses if the column is tracked in `cs_migrations` and not in `cut-over` phase. Also catches hand-written `psql` drops, which (a) doesn't. The reason for opt-in: event triggers require superuser / `pg_event_trigger` membership, which Supabase / Neon / RDS / Cloud SQL all restrict. Shipping it on by default would either fail `db install` for managed-Postgres users (large fraction of the audience) or skip silently (asymmetric guarantee). Opt-in lets the people who can install it do so, and the rest fall back to (a). Needs an escape hatch (`SET LOCAL cipherstash.allow_plaintext_drop = true`) for legitimate aborted-spike cleanups, and a clear `RAISE EXCEPTION` message naming the trigger and the remediation so the diagnosis path isn't a head-scratcher. Scope by cs_migrations membership rather than `*_plaintext` suffix to avoid false positives on user columns.

**(c) Documentation / skill emphasis on deploy ordering.** Make the four-deploy rollout explicit in the `stash-encryption` skill and in the migrate-existing-column section of `stash-drizzle` / `stash-supabase`: do not bundle these into one PR; do not let `drizzle-kit migrate` apply the drop before the cutover has run; check `encrypt status` shows `cut-over` on the target environment before merging the drop migration. (a) catches it when this fails; (c) makes failure less likely.

**(d) Optional: pre-deploy verification command.** `stash encrypt verify --against=<connection>` reads pending migrations on disk, cross-references cs_migrations on the target, and fails if a drop migration would run before its cutover. Wireable into CI. Nice-to-have on top of (a) — gives a *pre*-deploy signal instead of just a runtime abort.

Recommended scope: ship (a) + (c) together, then (b) as opt-in, then (d) if there's appetite. (b) is the only ironclad guarantee but the permissions story makes it impossible as a default.

### 3.8. `encrypt cutover` mishandles multi-column pending configs (real bug)

**Severity: high** — silent bookkeeping drift. Surfaced by the 2026-05-04 spike.

When a pending config contains more than one renamed column, `eql_v2.rename_encrypted_columns()` renames *all* the pairs in a single transaction (it operates on the whole pending config). But `stash encrypt cutover --column X` only emits a `cut_over` event for column X in `cs_migrations`. The other columns are physically renamed in the DB but their lifecycle bookkeeping is left at `backfilled`.

Repro: register two encrypted twins on the same table → backfill both → re-push with the renamed shape → `encrypt cutover --table T --column col1`. Result: both pairs renamed, pending promoted, but only `col1` has a `cut_over` row in `cs_migrations`. A subsequent `encrypt cutover --column col2` then fails with "No pending EQL configuration", and `encrypt drop --column col2` refuses because `cs_migrations` still says `backfilled`. Workaround in the spike was a manual `INSERT INTO cipherstash.cs_migrations` for the orphaned column.

Three viable fixes, in increasing scope:

1. **After `cutover` runs `rename_encrypted_columns()`, walk the pending config it just promoted and emit a `cut_over` event for *every* column whose `<col>_encrypted` sibling was renamed**, not just the one named on the CLI. Smallest change, matches the apparent intent. Side benefit: lets users batch multi-column cutovers via `encrypt cutover --table T` with no `--column` (cuts over every pending column on that table).
2. Change `rename_encrypted_columns()` (or add a per-column variant in EQL) so cutover semantics stay one-column-at-a-time. Bigger surface — touches EQL.
3. `cutover` refuses when pending contains more than one renamed column, requires explicit `--all-pending` (or per-column iteration). Conservative but introduces a new flag.

Recommended: (1). Walk `eql_v2_configuration WHERE state='active'` (just-promoted pending) for the table, diff the column set against pre-rename `cs_migrations` state, emit events accordingly.

### 3.9. `encrypt status` is blind until the first backfill runs

**Severity: medium** — erodes trust. Surfaced by the 2026-05-04 spike.

After `db push` writes an active EQL config that registers two columns, `encrypt status` prints "No encrypted columns yet. Run `stash db push`…" — even though `db push` already did that. The state only becomes visible after the first `encrypt backfill` writes an entry into `migrations.json`.

The skill docs claim status sources from three places (manifest, `eql_v2_configuration`, `cs_migrations`); the implementation gates the entire output on the manifest existing. A column in `eql_v2_configuration` but absent from `migrations.json` is itself a useful state to surface ("registered with EQL; no backfill recorded yet").

Two interacting fixes:

- **In `status.ts`**: drop the manifest-existence gate. Render every (table, column) seen in any of the three sources, with empty cells where a source is silent. The phase column should fall back to "registered (no backfill yet)" when EQL config has the column but `cs_migrations` doesn't.
- **In `db push`** (see also 3.11): write/update `migrations.json` whenever it registers a new column, with `targetPhase: "schema-added"`. That makes the manifest consistent from the very first command and is independently useful for PR review (intent visible before backfill).

### 3.10. `encrypt status` shows `encrypted-col-missing` flag for dropped columns

**Severity: low / cosmetic.** Surfaced by the 2026-05-04 spike.

After a full lifecycle run, a `dropped` column renders with the `encrypted-col-missing` flag set. The flag implies error, but it's the expected post-cutover state — the encrypted twin (`<col>_encrypted`) was renamed into the primary column's place during cutover and *should* be missing.

Fix: in `status.ts`'s `renderRow`, suppress the `encrypted-col-missing` flag when `phase === 'cut-over' || phase === 'dropped'`. Trivial. Optional: also rename the flag itself (`encrypted-col-missing` → `pre-cutover-shape` or similar) so it reads less alarming when it *is* legitimate.

### 3.11. `db push` should write `migrations.json`, not just `backfill`

**Severity: low / workflow gap.** Surfaced by the 2026-05-04 spike.

Today the manifest only appears once `encrypt backfill` runs. Until then the developer's intent file doesn't exist on disk, so PR reviewers can't see what's about to happen during phase 1 (schema-add) or the gap between schema-add and dual-writing.

Fix: `db push` should call `upsertManifestColumn` for every encrypted column it registers, with `targetPhase: "schema-added"` (or whichever current phase applies). Already half-built — `upsertManifestColumn` exists in `@cipherstash/migrate`. Ties directly into 3.9 (status going from blind to useful) and gives PR reviewers a code-reviewable artifact at the earliest sensible moment.

### 3.12. Orphaned EQL artifacts after partial drop; need a clean `db uninstall` (and a `db doctor`)

**Severity: medium** — blocks re-install on previously-touched databases, and is the second-largest agent-time sink the spike reported. Surfaced by the 2026-05-04 spike (CLI feedback) and reinforced by the same spike's agent-cost feedback.

EQL's footprint is split across three locations:

- `eql_v2` schema (functions, types, internal tables)
- `public.eql_v2_encrypted` type, `public.eql_v2_configuration` table, `public.eql_v2_configuration_state` enum
- `cipherstash` schema (`cs_migrations`)

If something runs `DROP SCHEMA eql_v2 CASCADE` (a tempting "uninstall" command), the `public.*` and `cipherstash.*` artifacts survive. `db status` then reports `EQL is not installed` (true — the `eql_v2` schema is gone), but a fresh `db install` runs into "type already exists" / row collisions because the public-schema bits are still there. Spike reproed this on a project that had been through a prior path-3 run with partial cleanup; `cs_migrations` had 25 rows of stale state.

The diagnostic burden is also a real cost on its own: characterising what survived a previous run cost the agent ~5–6 SQL round-trips (each probe revealing the next orphan). Compressing that to a single command is the highest-leverage CLI change for agent efficiency reported in the spike.

Fixes (interlocking, all worth shipping):

- **`db status`**: detect the orphaned-public-schema state (`public.eql_v2_configuration` / `public.eql_v2_encrypted` / `cipherstash.cs_migrations` exist while `eql_v2` schema is absent) and warn explicitly: *"EQL is not installed but orphaned artifacts remain in `public` and `cipherstash`. Run `stash db install --force` (or `stash db uninstall && stash db install`) to clean up before reinstalling."*
- **`stash db status --verbose` (or new `stash db doctor`)**: one command that reports `eql_v2` schema presence, public-artifact presence (each enum/type/table individually), `cipherstash.cs_migrations` row count and state, and a derived diagnosis line ("clean", "fully installed", "orphaned artifacts — run X", etc.). Replaces the 5–6 SQL probes the agent had to run by hand. Keep the existing `db status` terse (the column table) and put the heavier cross-system check behind `--verbose` or a separate `doctor` subcommand so the default invocation stays fast.
- **`db install --force`**: explicitly drop those orphans before reinstalling, so the command is idempotent against partial-cleanup states. (Currently `--force` doesn't exist on install — would need to add it.)
- **`stash db uninstall`** (new command): the supported teardown path — drops the `eql_v2` schema, the public-schema artifacts, and the `cipherstash` schema in the right order. So users have a single command that doesn't leave debris for the next install to trip over. Should refuse to run by default if `cs_migrations` shows columns past `dual-writing` (data-protection guard); `--force` to override.

---

## 4. Setup / detection improvements

### 4.1. Detect bundler in `stash init` and verify exclusion

`@cipherstash/stack` must be excluded from any bundler (Next.js, webpack, esbuild, Vite SSR). The agent missed this in the spike test. We've now baked it into the doctrine + skill + setup-prompt, but pre-empting at init time is stronger:

- Detect `next.config.*` / `vite.config.*` / `webpack.config.*` / etc.
- Read the file, check whether `@cipherstash/stack` and `@cipherstash/protect-ffi` are listed under the appropriate exclusion key.
- If not: print a warning (not an error) suggesting the agent fix it as part of the handoff.

### 4.2. Validate AGENTS.md handoff in Cursor and Windsurf

The AGENTS.md handoff path generates the file correctly, but we haven't verified it works end-to-end in Cursor or Windsurf. Concrete validation: open a project where init wrote AGENTS.md, ask the agent to encrypt a column, see whether the agent reads the inlined skill content and picks the right path.

### 4.3. Setup-prompt's "what `stash init` already did" checkbox list can be inaccurate

**Severity: medium** — misleads agents. Surfaced by the 2026-05-04 spike.

The auto-generated `setup-prompt.md` declared `[x] Installed the EQL extension and cipherstash.cs_migrations into the database` on a project where `db status` reported `EQL is not installed` (only `cs_migrations` had survived from a prior run; the EQL bits hadn't been re-installed). The prompt's claim was wrong, and an agent that trusts it without verifying skips steps it actually needs to do.

Two ways to fix:

1. **Re-verify at the end of init**: after the install steps run, query the DB to confirm what's actually present, and emit truthful checkbox states (`[x]` only when verified, `[ ]` with a hint otherwise). Robust against any partial-failure path.
2. **Drop the static checkbox list**: replace it with `Run \`<runner> stash db status\` to see current state.` — pushes verification onto the agent as part of its first orientation step rather than relying on a snapshot that may have been wrong from the moment it was written.

(2) is simpler and pairs naturally with the orient-and-route shape (the agent already runs verification commands during orientation). (1) is more user-friendly when correct but adds a moving part. Worth doing (2) first; revisit (1) only if the loss of the visible checklist causes confusion.

---

## 5. Public docs

### 5.1. Document the migration tool and lifecycle in the public docs repo

The `docs/` site (separate repo) should cover:

- The six-phase lifecycle.
- The three sources of truth (`migrations.json`, `eql_v2_configuration`, `cs_migrations`).
- The pending/active state machine and when each command runs.
- Recovery paths (`--force`, `discard`).
- The path 1 vs path 3 decision tree.

Should largely be a render of the same content in the `stash-encryption` skill, but accessible via the web.

---

## 6. Suite repo

### 6.1. Delete `packages/rulebook/` in cipherstash-js-suite

Gateway endpoint was closed via #506. The `packages/rulebook/` mirror in the suite is unused since the gateway endpoint never shipped. Remove in a follow-up — orthogonal to anything in the stack repo.

---

## 7. Smaller / opportunistic

### 7.1. Reconsider `stash encrypt new` and `stash encrypt migrate` CLI shortcuts

Discussed and dismissed in favour of "the agent does the work using skills + the underlying `backfill / cutover / drop` primitives." If users keep asking "how do I add an encrypted column" via the CLI, revisit. The shortcut would just be a thin wrapper that opens the agent with a focused prompt for that column.

### 7.2. Improve the `encryptionClient = await Encryption({ schemas: [] })` placeholder UX

Current behaviour: the placeholder file initialises with no schemas, and uses top-level await (`export const encryptionClient = await Encryption({ schemas: [...] })`) for ergonomics at the call site.

Two distinct issues, both worth addressing:

1. **Empty-schemas error visibility.** Encrypt commands surface a clear error pointing at the file. Worth confirming the error message is loud enough — the agent should immediately see "you need to update src/encryption/index.ts to reference your real encrypted tables" rather than just "no encrypted columns found".

2. **Top-level await breaks non-Next contexts.** Surfaced by the 2026-05-04 spike. Top-level await requires ESM. Next.js handles this fine (compiles to ESM), but anything outside Next — `tsx`-run scripts, seeders, one-off verification scripts, test fixtures — fails with `Top-level await is currently not supported with the "cjs" output format`. `tsx` defaults to CJS for `.ts` files unless the project sets `"type": "module"` (a heavier change than many users want) or renames the file to `.mts`. The spike lost ~10 minutes on a smoke-test script before working around it; the agent-cost feedback lists this as one of the three highest-leverage moves to remove a class of dead-end debugging.

   Fix: scaffold a lazy-singleton pattern by default:

   ```ts
   import { Encryption } from '@cipherstash/stack'

   let _client: Awaited<ReturnType<typeof Encryption>> | null = null
   let _pending: Promise<typeof _client> | null = null

   export async function getEncryptionClient() {
     if (_client) return _client
     _pending ??= Encryption({ schemas: [/* ... */] })
     _client = await _pending
     return _client
   }
   ```

   Slightly less ergonomic at the call site (`(await getEncryptionClient()).encryptModel(...)` vs `encryptionClient.encryptModel(...)`), but trivially compatible with both ESM and CJS — removes a category of "why doesn't my script run" support requests. If the top-level-await pattern stays the default, the placeholder comment block + the `stash-encryption` / `stash-drizzle` skills must call out the ESM constraint explicitly so users don't hit it cold.

### 7.3. Live coverage check in `encrypt status` during dual-writing

Today the PROGRESS column for a `dual-writing` row shows `(awaiting backfill)` because cs_migrations doesn't yet have backfill numbers — and we don't query the user's table for live coverage data. The original bug report suggested "rows-with-both-columns-set / total" as the meaningful measurement during dual-writing — i.e. is the deployed dual-write code actually populating both columns on every new row?

To do this properly:

- Add a live SELECT in status.ts when the column is in `dual-writing` phase: `SELECT count(*) FROM <table> WHERE <col> IS NOT NULL AND <col>_encrypted IS NOT NULL`, and `SELECT count(*) FROM <table>` for the total.
- Surface as `coverage 320/320 (✓ ready for backfill)` or `coverage 280/320 (40 rows missing dual-write)` with appropriate flag colour.
- This makes status the natural companion to `--confirm-dual-writes-deployed` — one command tells you whether you can safely backfill.

Skipped in the initial fix because it adds a per-row live query against the user's table (not just cs_migrations / EQL config reads). Worth doing when we revisit status.

---

## 8. Agent ergonomics / token economy

These items aren't direct CLI/skill changes — they're patterns the spike's agent-cost feedback flagged as avoidable waste during a real path-3 run. Recording them so when we revisit the prompt + skill content (1.4, 4.3) we can codify the discipline rather than relying on agents to remember.

### 8.1. Avoid redundant lifecycle restatements in user-facing prose

The spike agent summarised the migrate-existing-column flow at orientation, again at the "want me to proceed?" gate, and again in the end-of-task summary — each restatement ~200 words. Useful once, redundant by the third pass.

The orient-and-route prompt should explicitly direct: one orientation summary up front; one-line progress updates per phase mid-stream ("backfill done, 320 rows encrypted; ready for cutover"); one end-of-task summary. Mid-stream confirmation pauses are one line, not a paragraph. Worth a short "communication discipline" section in the orient-and-route prompt.

### 8.2. Verify-the-change discipline: stop when SQL inspection is sufficient

The spike agent wrote ~3–4 attempts at a standalone smoke-test script (top-level-await error → `.ts`/`.mts` swap → ESM resolution failure → giving up). Raw SQL inspection had already proven the data was encrypted, and a real integration test needed a browser login the agent couldn't perform — so the script was strictly redundant.

Codify in the prompt: if direct SQL inspection (`SELECT … FROM <table> WHERE <encrypted-col> IS NOT NULL LIMIT 5`) and a type-check already prove the change, do not write a standalone script that requires runtime infrastructure the agent can't access. Hand off to the user for browser/end-to-end verification instead. (Closing the top-level-await issue in 7.2 *also* removes this dead-end at the CLI scaffold layer; both layers help.)

### 8.3. Read selectively — grep + targeted Read, not full-file Read for context

The spike agent read several app files (e.g. ~130-line `transaction-form.tsx`) end-to-end to extract a single piece of structural information. The "I have to know everything before I touch anything" reflex over-paid.

Codify: for "what does this file do at a high level" questions, grep + targeted Read on the relevant range. Reserve full Read for files about to be edited substantively. Worth adding to the AGENTS.md doctrine alongside "don't log plaintext" / "encrypted columns are nullable jsonb" — same kind of cross-cutting discipline.

### 8.4. Re-read after move/rename

After `mv` / `git mv`, treat the new path as an unread file and `Read` before `Edit`. The spike agent had two `Edit` calls fail because of this; each cost a Read + retry round-trip. Minor but easy to bake in.

### 8.5. The lifecycle itself is fine

Recorded for completeness: the spike agent's cost analysis explicitly notes that the eight-phase migrate-existing-column lifecycle is irreducible — that's the real task. The waste is concentrated in orientation, diagnosis, and verification overhead surrounding it, not in the lifecycle steps themselves. So no lifecycle simplification is on the table; it's the wrapping that needs work.
