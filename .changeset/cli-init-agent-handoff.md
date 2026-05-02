---
'stash': minor
---

`stash init` can now hand off the rest of setup to whichever coding agent the user is set up with — and it leaves them with a project-specific action plan, not just generic rules.

The new pipeline:

1. **Authenticate** (unchanged).
2. **Resolve `DATABASE_URL`** — uses the same resolver as `stash db install` (flag → env → `supabase status` → interactive prompt). Hard-fails with an actionable message if nothing resolves.
3. **Build the encryption client.** When the database has tables, `init` introspects them (the same multi-select UX `stash schema build` has) and generates a real client from the user's selection. When the database is empty, it falls back to the placeholder so fresh projects still work — and the action prompt notes the placeholder so the agent reshapes it later.
4. **Install dependencies** — `@cipherstash/stack` (runtime) + `stash` (CLI dev dep). Renamed from "Forge" since that name no longer means anything.
5. **Install EQL into the database** — y/N confirm, then runs `stash db install` programmatically against the URL we already resolved. No second prompt for credentials.
6. **Pick a handoff** from the four-option menu:
   - **Hand off to Claude Code** — installs `.claude/skills/cipherstash-setup/SKILL.md`, writes `.cipherstash/context.json` and `.cipherstash/setup-prompt.md`, spawns `claude` interactively. Default when `claude` is on PATH.
   - **Hand off to Codex** — writes `AGENTS.md` + `.cipherstash/context.json` + `.cipherstash/setup-prompt.md`, spawns `codex` interactively. Default when `codex` is on PATH (and `claude` is not).
   - **Use the CipherStash Agent** — writes `.cipherstash/context.json` and runs `stash wizard`. Fallback for users without a local CLI agent.
   - **Write AGENTS.md** — writes `AGENTS.md` + `.cipherstash/context.json` + `.cipherstash/setup-prompt.md` and stops. For Cursor, Windsurf, Cline, and any tool that follows the AGENTS.md convention.

Detection is non-blocking: if the chosen CLI agent (`claude` or `codex`) isn't installed, init still writes the rules files and prints install + manual-launch instructions. Progress is never wasted.

`.cipherstash/setup-prompt.md` is the new headline artifact. It's the project-specific action plan — *"init has done X and Y; you need to do Z next, with these exact commands and paths"* — generated from the current init state. The launch prompt for Claude / Codex points the agent at this file first; the skill / AGENTS.md provides the reusable rulebook the prompt references. For IDE users, it's ready to paste into the first chat.

The rules content comes from a versioned rulebook (core + integration partials for Drizzle, Supabase, and plain PostgreSQL) shipped bundled with the CLI. When `wizard.getstash.sh/v1/wizard/rulebook` is reachable, the CLI prefers the gateway-served version so content updates between releases land without a CLI bump; network failures fall through to the bundled copy silently. `CIPHERSTASH_WIZARD_URL` overrides the gateway endpoint for local testing.

Re-running `init` is safe — both `SKILL.md` and `AGENTS.md` use sentinel-marker upsert (`<!-- cipherstash:rulebook start/end -->`), so the managed region is replaced in place and any user edits outside it are preserved. `setup-prompt.md` is regenerated wholesale each run since it's meant to reflect the current state.

The `.cipherstash/context.json` file is the universal "what shape is this project" payload — integration, encryption client path, schema, env key names (never values), package manager, install command, rulebook + CLI versions, generation timestamp.
