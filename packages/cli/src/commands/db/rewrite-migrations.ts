import { readFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * Matches drizzle-kit's generated in-place type change to the encrypted
 * column type. We accept both the fully-qualified
 * `"public"."eql_v2_encrypted"` form (emitted after CIP-2990) and the bare
 * `eql_v2_encrypted` form older schemas produced.
 *
 * Captures:
 * - $1: table name (without quotes)
 * - $2: column name (without quotes)
 */
const ALTER_COLUMN_TO_ENCRYPTED_RE =
  /ALTER TABLE "([^"]+)"\s+ALTER COLUMN "([^"]+)"\s+SET DATA TYPE (?:"public"\."eql_v2_encrypted"|eql_v2_encrypted)[^;]*;/gi

/**
 * Replace in-place `ALTER COLUMN ... SET DATA TYPE eql_v2_encrypted` statements
 * with an ADD + DROP + RENAME sequence.
 *
 * **Why this exists (CIP-2991, CIP-2994):** Postgres has no implicit cast from
 * `text`/`numeric` to `eql_v2_encrypted`, so `ALTER COLUMN ... SET DATA TYPE
 * eql_v2_encrypted` fails with `cannot cast type ... to eql_v2_encrypted`.
 * The fix that works on both empty and non-empty tables is to add a new
 * encrypted column, backfill it, drop the original, and rename the new
 * column into place. For empty tables the UPDATE is a no-op and the
 * sequence is effectively equivalent to DROP+ADD.
 *
 * We only rewrite the statement — the actual encryption of existing rows has
 * to happen in application code (via `encryptModel` from
 * `@cipherstash/stack`), which is why the UPDATE is emitted as a guidance
 * comment rather than real SQL. Running this migration against a populated
 * table leaves the new column NULL until the app backfills it.
 */
export async function rewriteEncryptedAlterColumns(
  outDir: string,
  options: { skip?: string } = {},
): Promise<string[]> {
  const entries = await readdir(outDir).catch(() => [])
  const rewritten: string[] = []

  for (const entry of entries) {
    if (!entry.endsWith('.sql')) continue
    const filePath = join(outDir, entry)
    if (options.skip && filePath === options.skip) continue

    const original = await readFile(filePath, 'utf-8')
    if (!ALTER_COLUMN_TO_ENCRYPTED_RE.test(original)) continue

    // Reset the regex's lastIndex — it's stateful on /g
    ALTER_COLUMN_TO_ENCRYPTED_RE.lastIndex = 0

    const updated = original.replace(
      ALTER_COLUMN_TO_ENCRYPTED_RE,
      (_match, table: string, column: string) => renderSafeAlter(table, column),
    )

    if (updated !== original) {
      await writeFile(filePath, updated, 'utf-8')
      rewritten.push(filePath)
    }
  }

  return rewritten
}

function renderSafeAlter(table: string, column: string): string {
  const tmp = `${column}__cipherstash_tmp`
  return [
    '-- Rewritten by @cipherstash/cli: in-place ALTER COLUMN cannot cast to',
    `-- eql_v2_encrypted. If "${table}" already has rows, backfill the new`,
    "-- column via @cipherstash/stack's encryptModel in application code BEFORE",
    '-- running this migration in production. Empty tables are safe as-is.',
    `ALTER TABLE "${table}" ADD COLUMN "${tmp}" "public"."eql_v2_encrypted";`,
    `-- UPDATE "${table}" SET "${tmp}" = /* encrypted value for ${column} */ NULL;`,
    `ALTER TABLE "${table}" DROP COLUMN "${column}";`,
    `ALTER TABLE "${table}" RENAME COLUMN "${tmp}" TO "${column}";`,
  ].join('\n')
}
