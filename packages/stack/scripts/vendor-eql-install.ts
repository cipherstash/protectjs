/**
 * Build-time vendor script: fetches the EQL install SQL bundle from the
 * pinned `encrypt-query-language` GitHub release, writes the raw SQL to
 * `src/prisma/core/eql-install.sql`, and emits a tiny TypeScript module
 * `src/prisma/core/eql-install.generated.ts` that exports the SQL as a
 * string literal.
 *
 * Why two artefacts:
 *   - The raw `.sql` file is committed and human-readable: easy to
 *     inspect during code review, easy for an operator to apply manually
 *     in an emergency, and easy to diff between version bumps.
 *   - The `.generated.ts` module is what the codec imports at runtime.
 *     It works in both ESM and CJS dist outputs because the SQL becomes
 *     a regular ES module export — no `import.meta`, no `fs.readFileSync`,
 *     no path resolution. The trade-off is the bundled JS is larger by
 *     the size of the SQL bundle (~170 KB), but the migration planner
 *     is the only consumer and it'd otherwise have to ship the SQL
 *     anyway via some other channel.
 *
 * Usage:
 *   pnpm vendor-eql-install
 *
 * The script is idempotent: if both files exist and the pinned version
 * line in the SQL header matches, the script no-ops. If the network call
 * fails and the files are absent, the script exits 1; if the files
 * already exist, the script logs a warning and reuses the cache.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Pinned EQL release version. Bump this only as part of an explicit
 * upgrade — Phase 3 ships against this version, Phase 4 will introduce
 * `databaseDependencies.upgrade(fromVersion, toVersion)` for live DDL
 * upgrades between bumps.
 */
const EQL_VERSION = 'eql-2.2.1' as const

const EQL_INSTALL_URL = `https://github.com/cipherstash/encrypt-query-language/releases/download/${EQL_VERSION}/cipherstash-encrypt.sql`

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const SQL_PATH = resolve(
  __dirname,
  '..',
  'src',
  'prisma',
  'core',
  'eql-install.sql',
)
const TS_PATH = resolve(
  __dirname,
  '..',
  'src',
  'prisma',
  'core',
  'eql-install.generated.ts',
)

/**
 * Magic header comment we prepend to the vendored SQL so we can verify
 * pinned-version match without re-downloading. Keeping it on the first
 * line means a quick `head -1` check tells us which version is on disk.
 */
const HEADER_PREFIX =
  '-- @cipherstash/stack/prisma — vendored EQL install bundle'

function buildHeader(version: string): string {
  return `${HEADER_PREFIX} (version: ${version})\n`
}

function existingVersion(): string | null {
  if (!existsSync(SQL_PATH)) return null
  const head = readFileSync(SQL_PATH, 'utf8').split('\n', 1)[0] ?? ''
  const match = head.match(
    /-- @cipherstash\/stack\/prisma — vendored EQL install bundle \(version: (.+?)\)/,
  )
  return match?.[1] ?? null
}

async function fetchBundle(url: string): Promise<string> {
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(
      `Failed to download EQL install bundle from ${url}: ${res.status} ${res.statusText}`,
    )
  }
  return res.text()
}

/**
 * Render the TypeScript module that exports the SQL bundle as a string
 * literal. We use a backtick-delimited template literal with the only
 * unsafe characters (backtick and `${`) escaped — never JSON.stringify
 * because the SQL bundle is large and we want it human-readable in the
 * source tree.
 */
function renderTsModule(version: string, sql: string): string {
  const escaped = sql
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\$\{/g, '\\${')
  return `// @generated — DO NOT EDIT.
// Source: scripts/vendor-eql-install.ts
// Bundle pinned version: ${version}
//
// This file is committed to source control so dev environments and
// offline builds work without network access. Regenerate with
// \`pnpm vendor-eql-install\` after bumping EQL_VERSION in the script.

export const EQL_INSTALL_VERSION = ${JSON.stringify(version)} as const

export const EQL_INSTALL_SQL: string = \`${escaped}\`
`
}

async function main(): Promise<void> {
  const onDisk = existingVersion()
  const tsExists = existsSync(TS_PATH)

  if (onDisk === EQL_VERSION && tsExists) {
    console.log(
      `[vendor-eql-install] Pinned version ${EQL_VERSION} already on disk — no-op.`,
    )
    return
  }

  console.log(
    `[vendor-eql-install] Fetching EQL install bundle (version: ${EQL_VERSION}) from ${EQL_INSTALL_URL}`,
  )

  let body: string
  try {
    body = await fetchBundle(EQL_INSTALL_URL)
  } catch (err) {
    if (existsSync(SQL_PATH) && tsExists) {
      console.warn(
        '[vendor-eql-install] Network fetch failed but cached bundle and generated module exist. Using cache.',
      )
      console.warn(
        `[vendor-eql-install] Cause: ${err instanceof Error ? err.message : String(err)}`,
      )
      return
    }
    throw err
  }

  const header = buildHeader(EQL_VERSION)
  writeFileSync(SQL_PATH, header + body, 'utf8')
  writeFileSync(TS_PATH, renderTsModule(EQL_VERSION, body), 'utf8')
  console.log(`[vendor-eql-install] Wrote ${SQL_PATH} (${body.length} bytes)`)
  console.log(`[vendor-eql-install] Wrote ${TS_PATH}`)
}

void main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err)
  console.error(`[vendor-eql-install] Error: ${message}`)
  process.exit(1)
})
