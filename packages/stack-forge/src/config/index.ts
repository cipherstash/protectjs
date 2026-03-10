import fs from 'node:fs'
import path from 'node:path'
import type { EncryptionClient } from '@cipherstash/stack/encryption'
import type { EncryptConfig } from '@cipherstash/stack/schema'
import { z } from 'zod'

export interface StashConfig {
  /** PostgreSQL connection string */
  databaseUrl: string
  /** Path to encryption client file. Defaults to `'./src/encryption/index.ts'`. */
  client?: string
}

/** The config shape after Zod validation, with all defaults applied. */
export type ResolvedStashConfig = Required<Pick<StashConfig, 'client'>> &
  Omit<StashConfig, 'client'>

/**
 * Define a stash config with type checking.
 * Use this as the default export in your `stash.config.ts`.
 *
 * @example
 * ```ts
 * import { defineConfig } from '@cipherstash/stack-forge'
 *
 * export default defineConfig({
 *   databaseUrl: process.env.DATABASE_URL!,
 *   client: './src/encryption/index.ts',
 * })
 * ```
 */
export function defineConfig(config: StashConfig): StashConfig {
  return config
}

const CONFIG_FILENAME = 'stash.config.ts'

const DEFAULT_ENCRYPT_CLIENT_PATH = './src/encryption/index.ts'

const stashConfigSchema = z.object({
  databaseUrl: z
    .string({ required_error: 'databaseUrl is required' })
    .min(1, 'databaseUrl must not be empty'),
  client: z.string().default(DEFAULT_ENCRYPT_CLIENT_PATH),
})

/**
 * Search for `stash.config.ts` starting from `startDir` and walking up
 * parent directories until the filesystem root is reached.
 *
 * Returns the absolute path if found, or `undefined` if not.
 */
function findConfigFile(startDir: string): string | undefined {
  let dir = path.resolve(startDir)

  while (true) {
    const candidate = path.join(dir, CONFIG_FILENAME)

    if (fs.existsSync(candidate)) {
      return candidate
    }

    const parent = path.dirname(dir)

    // Reached filesystem root
    if (parent === dir) {
      return undefined
    }

    dir = parent
  }
}

/**
 * Load and validate the `stash.config.ts` from the user's project.
 *
 * Searches from `process.cwd()` upward. Uses `jiti` to evaluate the
 * TypeScript config file at runtime without a separate compile step.
 *
 * Exits with code 1 if the config file is not found or fails validation.
 */
export async function loadStashConfig(): Promise<ResolvedStashConfig> {
  const configPath = findConfigFile(process.cwd())

  if (!configPath) {
    console.error(`Error: Could not find ${CONFIG_FILENAME}

Create a ${CONFIG_FILENAME} file in your project root:

  import { defineConfig } from '@cipherstash/stack-forge'

  export default defineConfig({
    databaseUrl: process.env.DATABASE_URL!,
  })
`)
    process.exit(1)
  }

  const { createJiti } = await import('jiti')
  const jiti = createJiti(configPath, {
    interopDefault: true,
  })

  let rawConfig: unknown
  try {
    rawConfig = await jiti.import(configPath)
  } catch (error) {
    console.error(`Error: Failed to load ${CONFIG_FILENAME} at ${configPath}\n`)
    console.error(error)
    process.exit(1)
  }

  const result = stashConfigSchema.safeParse(rawConfig)

  if (!result.success) {
    console.error(`Error: Invalid ${CONFIG_FILENAME}\n`)

    for (const issue of result.error.issues) {
      console.error(`  - ${issue.path.join('.')}: ${issue.message}`)
    }

    console.error()
    process.exit(1)
  }

  return result.data
}

/**
 * Load the encryption schema file referenced by the stash config.
 *
 * Resolves the schema path relative to `process.cwd()`, loads the file via
 * `jiti`, collects all exported `EncryptedTable` instances, and builds the
 * encrypt config via `buildEncryptConfig`.
 *
 * Exits with code 1 if the file cannot be loaded or contains no tables.
 */
export async function loadEncryptConfig(
  encryptClientPath: string,
): Promise<EncryptConfig | undefined> {
  const resolvedPath = path.resolve(process.cwd(), encryptClientPath)

  if (!fs.existsSync(resolvedPath)) {
    console.error(
      `Error: Encrypt client file not found at ${resolvedPath}\n\nCheck the "encryptClient" path in your ${CONFIG_FILENAME}.`,
    )
    process.exit(1)
  }

  const { createJiti } = await import('jiti')
  const jiti = createJiti(resolvedPath, {
    interopDefault: true,
  })

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

  const encryptClient = Object.values(moduleExports).find(
    (value): value is EncryptionClient =>
      !!value &&
      typeof value === 'object' &&
      'getEncryptConfig' in value &&
      typeof (value as { getEncryptConfig?: unknown }).getEncryptConfig ===
        'function',
  )

  if (!encryptClient) {
    console.error(
      `Error: No EncryptionClient export found in ${encryptClientPath}.`,
    )
    process.exit(1)
  }

  const config = encryptClient.getEncryptConfig()
  if (!config) {
    console.error(
      `Error: Encryption client in ${encryptClientPath} has no initialized encrypt config.`,
    )
    process.exit(1)
  }
  return config
}
