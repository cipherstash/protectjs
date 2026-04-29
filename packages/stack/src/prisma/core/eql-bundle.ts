import { EQL_INSTALL_SQL, EQL_INSTALL_VERSION } from './eql-install.generated'

/**
 * Vendored EQL install SQL bundle.
 *
 * The bundle is fetched at build time by `scripts/vendor-eql-install.ts`
 * from a pinned `encrypt-query-language` GitHub release. Two artefacts
 * are produced:
 *
 *   - `core/eql-install.sql` (committed, human-readable, easy to diff
 *     between version bumps and apply manually in emergencies).
 *   - `core/eql-install.generated.ts` (committed, the same SQL exported
 *     as a TypeScript string literal so it can be imported directly
 *     into the codec module).
 *
 * Importing the SQL as a string literal is the simplest path to ESM/CJS
 * portability — no `import.meta`, no `fs.readFileSync`, no path
 * resolution. tsup inlines the literal into both dist outputs the same
 * way it inlines any other string constant.
 *
 * The trade-off is bundle size: every consumer of `@cipherstash/stack/prisma`
 * pays the SQL's ~170 KB even if they never run a migration. The
 * migration planner is the only consumer; we accept the size for the
 * portability win until/if Prisma Next exposes a streaming-asset
 * resolution surface.
 */

/**
 * Return the vendored EQL install SQL (entire bundle as one string).
 *
 * The bundle is intended for direct execution against Postgres as part
 * of the `databaseDependencies.init` migration step. Phase 4's
 * `databaseDependencies.upgrade` will diff this version against the
 * currently-installed one and emit upgrade DDL instead.
 */
export function getEqlInstallSql(): string {
  return EQL_INSTALL_SQL
}

/**
 * Pinned EQL release version baked into the vendored bundle. Surfaced
 * through the control descriptor's `version` field so future
 * `databaseDependencies.upgrade(fromVersion, toVersion)` work has a
 * hook.
 */
export function getEqlBundleVersion(): string {
  return EQL_INSTALL_VERSION
}
