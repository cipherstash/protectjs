---
'@cipherstash/cli': minor
---

`stash init` can now hand off the rest of setup to whichever coding agent the user is set up with.

After authentication, schema generation, and Forge install, init shows a four-option menu:

- **Hand off to Claude Code** — installs `.claude/skills/cipherstash-setup/SKILL.md`, writes `.cipherstash/context.json`, spawns `claude` interactively. Default when `claude` is on PATH.
- **Hand off to Codex** — writes `AGENTS.md` + `.cipherstash/context.json`, spawns `codex` interactively. Default when `codex` is on PATH (and `claude` is not).
- **Use the CipherStash Agent** — writes `.cipherstash/context.json` and runs `stash wizard`. The fallback for users without a local CLI agent.
- **Write AGENTS.md** — writes `AGENTS.md` + `.cipherstash/context.json` and stops. For Cursor, Windsurf, Cline, and any tool that follows the AGENTS.md convention.

Detection is non-blocking: if the chosen CLI agent (`claude` or `codex`) isn't installed, the CLI still writes the rules files and prints install + manual-launch instructions. The user's progress is never wasted.

The rules content comes from a versioned rulebook (core + integration partials for Drizzle, Supabase, and plain PostgreSQL) shipped bundled with the CLI. When `wizard.getstash.sh/v1/wizard/rulebook` is reachable, the CLI prefers the gateway-served version so content updates between releases land without a CLI bump; network failures fall through to the bundled copy silently. `CIPHERSTASH_WIZARD_URL` overrides the gateway endpoint for local testing.

Re-running `init` is safe — both `SKILL.md` and `AGENTS.md` use sentinel-marker upsert (`<!-- cipherstash:rulebook start/end -->`), so the managed region is replaced in place and any user edits outside it are preserved.

The `.cipherstash/context.json` file is the universal "what shape is this project" payload — integration, encryption client path, schema, env key names (never values), package manager, install command, rulebook + CLI versions, generation timestamp.
