# `@cipherstash/cli` — agent notes

## Two test suites

This package has **two** Vitest configs. Run the right one for the change.

| Command | Config | Scope | Needs build? |
| --- | --- | --- | --- |
| `pnpm --filter @cipherstash/cli test` | `vitest.config.ts` | Unit tests under `src/__tests__/**` and `src/**/__tests__/**` | No |
| `pnpm --filter @cipherstash/cli test:e2e` | `vitest.integration.config.ts` | E2E tests under `tests/e2e/**.e2e.test.ts` driving the built `dist/bin/stash.js` through a real pty (`node-pty`) | **Yes** — run `pnpm --filter @cipherstash/cli build` first, or use the turbo `test:e2e` task which depends on `build`. |

The unit config explicitly excludes `tests/e2e/**` so the default `pnpm test`
stays fast and self-contained.

## When to add or update an E2E test

Update `tests/e2e/**` whenever you:

- Add or rename a top-level command, subcommand, or flag (smoke tests assert
  on help text, command names, and unknown-command behavior).
- Change the user-facing string for an exit message that an existing E2E
  asserts on (e.g. "Setup cancelled.", "Unknown auth command:",
  "not yet implemented"). Either update the assertion or, preferably, route
  the string through the future `messages.ts` module (see
  `docs/plans/cli-pty-integration-tests.md`, phase 2).
- Touch `src/bin/stash.ts` argv parsing, exit codes, or top-level error
  handling.
- Add a new clack prompt that changes the *first* prompt rendered for a
  command currently covered by E2E (the cancel test waits for a specific
  prompt label).

You do **not** need to add an E2E test for every new flag or branch — keep
E2E coverage to the highest-value flows. Unit tests still own the bulk of
behaviour coverage.

## How the harness works

`tests/helpers/pty.ts` exports `render(args, opts?)` which spawns
`dist/bin/stash.js` inside a real pseudo-terminal and returns:

- `output` — cumulative ANSI-stripped stdout.
- `raw` — same, with ANSI escapes preserved (handy when debugging).
- `waitFor(text|regex, timeoutMs?)` — polls until the match appears.
- `key(name)` — sends keystrokes (`Enter`, `Up`, `Down`, `CtrlC`, etc.).
- `write(string)` — raw stdin write.
- `exit` — promise resolving to `{ exitCode, signal? }`.
- `kill(signal?)` — terminate the pty.

A real pty is required because `@clack/prompts` switches stdin to raw mode
and renders differently when stdout isn't a TTY; piped-stdin mocks don't
exercise the same code paths.

## Gotchas

- **Build before E2E.** `dist/bin/stash.js` is the artifact under test. The
  turbo `test:e2e` task already depends on `build`, but if you invoke the
  script directly you must build first.
- **macOS spawn-helper exec bit.** pnpm strips the executable bit when
  unpacking node-pty's prebuilds. The helper auto-fixes this at module load
  via `ensureSpawnHelperExecutable`. If you see `posix_spawnp failed` after
  reinstalling `node_modules`, the chmod logic should handle it on next
  test run; if not, manually `chmod +x` the helper under
  `node_modules/.pnpm/node-pty@*/node_modules/node-pty/prebuilds/<plat>/spawn-helper`.
- **Don't broaden the cancel test target.** `auth login` was chosen because
  `selectRegion()` runs before any network I/O. Don't move the cancel
  assertion to a command that hits the auth server or DB before the first
  prompt — flaky.
- **Don't assert on full prompt strings if avoidable.** Prefer stable
  substrings. Phase 2 (planned) introduces a `messages.ts` module so test
  assertions can import handles and survive copy changes; until then,
  assert on the most stable fragment ("Select a region", not the full
  rendered prompt frame).
- **Telemetry.** The CLI source no longer imports `posthog-node` (analytics
  moved to `packages/wizard`). The dep is still listed in `package.json`
  and should be removed in a follow-up. If you re-introduce telemetry to
  the CLI, gate construction on an env var (the wizard's
  `getClient()` pattern) so E2E tests can no-op it.

## Plan and rationale

Background, alternative approaches considered, and the phase-2 messages
module are in `docs/plans/cli-pty-integration-tests.md`.
