---
'@cipherstash/cli': minor
---

`stash init` can now hand off the rest of setup to your local coding agent.

When `claude` is on PATH, `init` offers to install a project-local Claude Code skill at `.claude/skills/cipherstash-setup/SKILL.md` and write a `.cipherstash/context.json` describing the integration, encryption client path, columns, env keys, and package manager. Choosing the handoff option then launches `claude` interactively with a prompt that points at the skill and context file. The skill body is rendered from a versioned rulebook with integration-specific rules for Drizzle, Supabase, and plain PostgreSQL — so the agent gets the same correctness rules our hosted wizard uses.

Three follow-up modes are available at the new "how to proceed" step:

- **Hand off to Claude Code** — install skill, write context, spawn `claude`. Default when `claude` is detected.
- **Just write the rules files** — same writes, no spawn. For users driving Codex / Cursor / their own agent.
- **Use the built-in wizard** — keeps the existing `stash wizard` flow as the fallback.

The rulebook ships bundled with the CLI; if `wizard.getstash.sh/v1/wizard/rulebook` is reachable, the CLI prefers the gateway-served version (so content updates between releases land without a CLI bump). Network failures fall through to the bundled copy silently.

Re-running `init` is safe — both the SKILL.md and any future shared artifact use sentinel-marker upsert (`<!-- cipherstash:rulebook start/end -->`), so the managed region is replaced in place and any user edits outside it are preserved.

Phase 1 only targets Claude Code; Codex (`AGENTS.md` + spawn `codex`), Cursor `.cursor/rules/*.mdc`, and `.github/copilot-instructions.md` are scoped for follow-up phases.
