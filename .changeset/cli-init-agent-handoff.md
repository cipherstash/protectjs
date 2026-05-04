---
'stash': minor
---

`stash init` can now hand off the rest of setup to whichever coding agent the user is set up with — and it leaves them with a project-specific action plan and the right reference material, not just generic rules.

The new pipeline:

1. **Authenticate** (unchanged).
2. **Resolve `DATABASE_URL`** — uses the same resolver as `stash db install` (flag → env → `supabase status` → interactive prompt). Hard-fails with an actionable message if nothing resolves.
3. **Build the encryption client.** When the database has tables, `init` introspects them and generates a real client from the user's selection. When the database is empty, it falls back to a placeholder so fresh projects still work — and the action prompt notes the placeholder so the agent reshapes it later.
4. **Install dependencies** — `@cipherstash/stack` (runtime) + `stash` (CLI dev dep).
5. **Install EQL into the database** — y/N confirm, then runs `stash db install` programmatically against the URL we already resolved. No second prompt for credentials.
6. **Pick a handoff** from the four-option menu. Each handoff installs the right artifacts for the chosen tool:
   - **Hand off to Claude Code** — copies the per-integration set of authored skills (`stash-encryption` + `stash-<integration>` + `stash-cli`) into `.claude/skills/`, writes `.cipherstash/context.json` and `.cipherstash/setup-prompt.md`, spawns `claude`. Default when `claude` is on PATH.
   - **Hand off to Codex** — writes a sentinel-managed `AGENTS.md` (durable doctrine) + copies the same skills into `.codex/skills/` (procedural workflows), writes `context.json` + `setup-prompt.md`, spawns `codex`. Default when `codex` is on PATH and `claude` is not. Follows OpenAI's Codex guidance: AGENTS.md for repo doctrine, skills for repeatable workflows.
   - **Use the CipherStash Agent** — writes `context.json` and runs `stash wizard`. Fallback for users without a local CLI agent. The wizard installs its own skills.
   - **Write AGENTS.md** — for editor agents (Cursor, Windsurf, Cline) that don't auto-load skill directories. Writes a single `AGENTS.md` with the doctrine *plus* the relevant skill content inlined under a sentinel block, so the agent has the API details without needing to follow file references. Plus `context.json` + `setup-prompt.md`. No spawn.

Detection is non-blocking: if the chosen CLI agent (`claude` or `codex`) isn't installed, init still writes the artifacts and prints install + manual-launch instructions. Progress is never wasted.

`.cipherstash/setup-prompt.md` is the headline artifact. It's the project-specific action plan — *"init has done X and Y; you need to do Z next, with these exact commands and paths"* — generated from the current init state. The launch prompt for Claude / Codex points the agent at this file first; the installed skills provide the reusable rulebook the prompt references. For IDE users, it's ready to paste into the first chat.

Per-integration skill subset:

```text
drizzle    → stash-encryption + stash-drizzle  + stash-cli
supabase   → stash-encryption + stash-supabase + stash-cli
postgresql → stash-encryption + stash-cli
```

The skills themselves are the authored ones at the repo root (`/skills/`); they ship inside the CLI tarball via `tsup` so init can copy them locally without a network round-trip. The AGENTS.md doctrine fragment ships the same way.

Re-running `init` is safe — `AGENTS.md` uses sentinel-marker upsert (`<!-- cipherstash:rulebook start/end -->`), so the managed region is replaced in place and any user edits outside it are preserved. Skill directories are overwritten so the user always gets the latest content. `setup-prompt.md` is regenerated wholesale each run since it's meant to reflect the current state.

`.cipherstash/context.json` is the universal "what shape is this project" payload — integration, encryption client path, schema, env key names (never values), package manager, install command, CLI version, names of installed skills, generation timestamp.
