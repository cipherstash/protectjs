/**
 * User-facing message handles for strings that E2E tests assert on.
 *
 * Production code imports these instead of inlining literals so that copy
 * tweaks (rename, rephrase, capitalisation) only need to land in one place
 * and tests stay green automatically.
 *
 * Scope: only strings the E2E suite asserts on. Inline strings that no test
 * depends on stay inline — premature extraction is worse than copy-paste
 * here. See `packages/cli/AGENTS.md` for guidance on what to add.
 */
export const messages = {
  cli: {
    versionBannerPrefix: 'CipherStash CLI v',
    usagePrefix: 'Usage: npx stash',
    unknownCommand: 'Unknown command',
  },
  auth: {
    usagePrefix: 'Usage: npx stash auth',
    unknownSubcommand: 'Unknown auth command',
    selectRegion: 'Select a region',
    cancelled: 'Cancelled.',
  },
  db: {
    unknownSubcommand: 'Unknown db subcommand',
    migrateNotImplemented: '"npx stash db migrate" is not yet implemented.',
  },
} as const
