import fs from 'node:fs'
import path from 'node:path'
import { type ResolvedStashConfig, loadStashConfig } from '@/config/index.js'
import type { EncryptionClient } from '@cipherstash/stack/encryption'

export interface EncryptedTableLike {
  readonly tableName: string
  build(): { tableName: string; columns: Record<string, unknown> }
}

export interface EncryptionContext {
  stashConfig: ResolvedStashConfig
  client: EncryptionClient
  tables: Map<string, EncryptedTableLike>
}

/**
 * Load stash.config.ts, dynamic-import the user's encryption client file, and
 * harvest (a) the initialised EncryptionClient and (b) all exported
 * EncryptedTable instances, keyed by tableName. Backfill needs both.
 *
 * Exits with code 1 on any load error — consistent with the pattern used by
 * loadStashConfig / loadEncryptConfig.
 */
export async function loadEncryptionContext(): Promise<EncryptionContext> {
  const stashConfig = await loadStashConfig()
  const resolvedPath = path.resolve(process.cwd(), stashConfig.client)

  if (!fs.existsSync(resolvedPath)) {
    console.error(
      `Error: Encrypt client file not found at ${resolvedPath}\n\nCheck the "client" path in your stash.config.ts.`,
    )
    process.exit(1)
  }

  const { createJiti } = await import('jiti')
  const jiti = createJiti(resolvedPath, { interopDefault: true })

  let moduleExports: Record<string, unknown>
  try {
    moduleExports = (await jiti.import(resolvedPath)) as Record<string, unknown>
  } catch (error) {
    console.error(
      `Error: Failed to load encrypt client file at ${resolvedPath}\n`,
    )
    console.error(error)
    process.exit(1)
  }

  let client: EncryptionClient | undefined
  const tables = new Map<string, EncryptedTableLike>()

  for (const value of Object.values(moduleExports)) {
    if (!value || typeof value !== 'object') continue

    if (
      'getEncryptConfig' in value &&
      typeof (value as { getEncryptConfig?: unknown }).getEncryptConfig ===
        'function'
    ) {
      client = value as EncryptionClient
      continue
    }

    if (
      'tableName' in value &&
      typeof (value as { tableName?: unknown }).tableName === 'string' &&
      'build' in value &&
      typeof (value as { build?: unknown }).build === 'function'
    ) {
      const table = value as EncryptedTableLike
      tables.set(table.tableName, table)
    }
  }

  if (!client) {
    console.error(
      `Error: No EncryptionClient export found in ${stashConfig.client}.`,
    )
    process.exit(1)
  }

  return { stashConfig, client, tables }
}

export function requireTable(
  ctx: EncryptionContext,
  tableName: string,
): EncryptedTableLike {
  const table = ctx.tables.get(tableName)
  if (!table) {
    const available = Array.from(ctx.tables.keys()).join(', ') || '(none)'
    console.error(
      `Error: Table "${tableName}" was not found in the encryption client exports.\n` +
        `Available: ${available}`,
    )
    process.exit(1)
  }
  return table
}
