import fs from 'node:fs'
import path from 'node:path'
import { z } from 'zod'

export interface StashConfig {
  /** PostgreSQL connection string */
  databaseUrl: string
  /** Optional: CipherStash workspace ID */
  workspaceId?: string
  /** Optional: CipherStash client access key */
  clientAccessKey?: string
}

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
 * })
 * ```
 */
export function defineConfig(config: StashConfig): StashConfig {
  return config
}

const CONFIG_FILENAME = 'stash.config.ts'

const stashConfigSchema = z.object({
  databaseUrl: z
    .string({ required_error: 'databaseUrl is required' })
    .min(1, 'databaseUrl must not be empty'),
  workspaceId: z.string().optional(),
  clientAccessKey: z.string().optional(),
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
export async function loadStashConfig(): Promise<StashConfig> {
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
