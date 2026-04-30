# Plan: node-pty Integration Tests for `@cipherstash/cli`

## Goal

Add a small, sustainable integration test layer for the `stash` CLI that
exercises the built binary through a real pseudo‑terminal, so we can catch
regressions in `@clack/prompts` flows (rendering, key handling, cancellation,
exit codes) that the existing unit tests can't see.

Non‑goals for v1:
- Full coverage of every command/flag combination.
- Spinning up real Postgres / real auth servers.
- Replacing existing unit tests.

## Why node-pty (vs alternatives)

- `mock-stdin` doesn't drive a real TTY; clack's raw‑mode select/multiselect
  prompts behave differently or not at all.
- `cli-testing-library` (crutchcorn) drives stdin without a pty — same
  fidelity concern; revisit only if we hit `node-pty` build pain.
- `expect(1)` adds a Tcl runtime and lives outside Vitest — the team has
  found it clunky in past projects.

`node-pty` (or the prebuilt fork `node-pty-prebuilt-multiarch`) gives us a
real pty inside Vitest with no second toolchain. The cost is one native
module on install.

## Scope of v1

Cover the cheap, high‑value surface first. Each test runs the **built**
`packages/cli/dist/bin/stash.js` so we exercise the same artifact users
get.

| Test | Command | What it asserts |
| --- | --- | --- |
| help | `stash --help` | exit 0, output contains "CipherStash CLI v" and command list |
| version | `stash --version` | exit 0, output matches `package.json#version` |
| unknown top-level | `stash bogus` | exit 1, output contains "Unknown command" + help |
| auth no-subcommand | `stash auth` | exit 0, output contains auth HELP |
| auth unknown sub | `stash auth bogus` | exit 1, output contains "Unknown auth command" |
| db unknown sub | `stash db bogus` | exit 1, output contains "Unknown db subcommand" |
| db migrate stub | `stash db migrate` | exit 0, warns "not yet implemented" |
| init cancel | `stash init` then ctrl‑c at first prompt | exit 0, output contains "Setup cancelled." |

`init cancel` is the only test that drives a clack prompt; it's enough to
validate the helper end‑to‑end without standing up auth or a database.
Deeper flows (full `init`, `db install --dry-run` with fixtures) come in
a follow‑up once the harness is proven.

## Deliverables

1. `node-pty-prebuilt-multiarch` added as a dev dependency on
   `packages/cli`. Use the prebuilt fork rather than upstream `node-pty`
   to skip the C++ toolchain requirement on dev machines and CI.
2. `packages/cli/vitest.integration.config.ts` — separate config so
   integration tests don't slow the default `vitest run`. Uses
   `pool: 'forks'` and a 30s `testTimeout`; matches `**/*.e2e.test.ts`.
3. `packages/cli/tests/helpers/pty.ts` — small wrapper around
   `node-pty.spawn` exposing:
   - `render(args, opts?)` → `{ output, waitFor, write, key, exitCode, kill }`
   - `output` is the cumulative ANSI‑stripped buffer.
   - `waitFor(text, timeoutMs?)` polls until text appears or rejects.
   - `key('Enter' | 'Up' | 'Down' | 'CtrlC' | …)` writes the right escape.
   - `exitCode` resolves when the pty exits.
   Target: ~80 lines, no external deps beyond `strip-ansi`.
4. `packages/cli/tests/e2e/smoke.e2e.test.ts` — covers the help / version /
   unknown‑command / `auth` / `db migrate` rows from the table above.
5. `packages/cli/tests/e2e/init-cancel.e2e.test.ts` — runs `stash init`,
   waits for the first clack prompt, sends ``, asserts the
   cancellation message and exit code 0.
6. `packages/cli/package.json` script: `"test:e2e": "vitest run --config
   vitest.integration.config.ts"`. Default `test` script unchanged.
7. `turbo.json` task `test:e2e` with `dependsOn: ["^build", "build"]` so
   the CLI is rebuilt before E2E runs. Keep `cache: false`.
8. CI: extend the existing test workflow to also run `pnpm --filter
   @cipherstash/cli test:e2e`. Confirm the prebuilt binary resolves on
   the GH runners (Linux x64, macOS arm64). If it doesn't, fall back to
   upstream `node-pty` and add `python3` / build tools to the workflow.

## Test harness shape (sketch)

```ts
// tests/helpers/pty.ts
import { spawn, type IPty } from 'node-pty-prebuilt-multiarch'
import stripAnsi from 'strip-ansi'
import { resolve } from 'node:path'

const STASH_BIN = resolve(__dirname, '../../dist/bin/stash.js')

export interface RenderOptions {
  cwd?: string
  env?: Record<string, string>
  cols?: number
  rows?: number
}

export function render(args: string[], opts: RenderOptions = {}) {
  const pty = spawn('node', [STASH_BIN, ...args], {
    cwd: opts.cwd ?? process.cwd(),
    cols: opts.cols ?? 100,
    rows: opts.rows ?? 30,
    env: { ...process.env, NO_COLOR: '1', CI: '1', ...opts.env },
  })

  let raw = ''
  pty.onData((d) => { raw += d })

  const exitCode = new Promise<number>((res) => {
    pty.onExit(({ exitCode }) => res(exitCode))
  })

  return {
    pty,
    get output() { return stripAnsi(raw) },
    get raw() { return raw },
    exitCode,
    write: (s: string) => pty.write(s),
    key: (k: 'Enter' | 'Up' | 'Down' | 'Space' | 'CtrlC' | 'Esc') =>
      pty.write(KEYS[k]),
    waitFor: (text: string | RegExp, timeoutMs = 5000) => /* poll */ undefined,
    kill: () => pty.kill(),
  }
}

const KEYS = {
  Enter: '\r',
  Up: '[A',
  Down: '[B',
  Space: ' ',
  CtrlC: '',
  Esc: '',
} as const
```

## Rollout

1. Land harness + smoke tests behind `test:e2e` (not part of default
   `pnpm test`). One PR.
2. Wire CI in a follow‑up PR after we've watched the suite locally on
   both macOS and Linux for a few runs.
3. Add deeper flows (full `init`, `db install --dry-run` against a
   throw‑away Postgres) in subsequent PRs once the harness is stable.

## Open questions

- **Native binary on CI**: CI has build tools available, so upstream
  `node-pty` is fine if `node-pty-prebuilt-multiarch` is missing
  prebuilts for any of our targets. Decide at install time.

## Resolved

- **Telemetry — not a concern for the CLI.** A grep across
  `packages/cli/src/` shows zero `posthog` imports; analytics moved to
  `packages/wizard` when that package was extracted. The CLI's
  `package.json` still lists `posthog-node` as a dep — stale, worth
  removing in a follow-up but not blocking. For *future* wizard E2E
  tests: `posthog-node` has no built-in disable env var, but
  `wizard/src/lib/analytics.ts` already short-circuits when the API
  key is empty, so passing an empty `POSTHOG_API_KEY` in test env is
  enough.

## Phase 2: message handles for assertion stability

Once the harness is landed, introduce a lightweight messages module to
decouple test assertions from prompt wording. Goal: when product tweaks
copy, *no test changes are needed*.

**Shape — not an i18n framework.** A single `src/messages.ts` (or
per-command `messages.ts`) exporting a typed `as const` object:

```ts
export const messages = {
  init: {
    intro: 'CipherStash Stack Setup',
    cancelled: 'Setup cancelled.',
    complete: 'Setup complete!',
  },
  auth: {
    unknownSubcommand: (sub: string) => `Unknown auth command: ${sub}`,
  },
  db: {
    migrateNotImplemented:
      '"npx @cipherstash/cli db migrate" is not yet implemented.',
  },
} as const
```

- Production code substitutes literals with `messages.x.y`.
- Tests `import { messages }` and assert `output.includes(messages.x.y)`.
- TypeScript catches every site on rename — including tests.
- Zero deps, zero runtime cost.

**Hybrid policy:** only extract strings that tests assert on. Inline
strings that no test depends on stay inline — premature extraction is
worse than copy-paste here.

**Anti-pattern, do not adopt:** emitting hidden marker tokens (e.g.
`[init.cancelled]`) in user-facing output and stripping them before
display. Complicates the renderer, breaks terminal copy/paste, earns
nothing the messages module doesn't already give us.

**Sequencing:**
1. Phase 1 PR: harness + smoke tests using literal-string assertions
   against text that's been stable across many releases (help banner,
   `"Unknown command"`, the `db migrate` warning, `"Setup cancelled."`).
2. Phase 2 PR: introduce `messages.ts`, mechanically migrate prod call
   sites and test assertions in the same change. Small, reviewable.
3. Defer full i18n until there's an actual localisation requirement.
