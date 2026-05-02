import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Integration, SchemaDef } from './types.js'

/**
 * Checks if a package is installed and loadable from the current project.
 *
 * We require both the package directory AND a `package.json` inside it. A
 * leftover directory without a manifest (from an aborted install, a previous
 * tool that wrote the path before failing, or a workspace symlink whose
 * target was removed) was previously treated as installed — that caused
 * `installCommand` later in init to load `stash.config.ts` and fail with
 * `Cannot find module 'stash'` at the jiti import. Requiring the manifest
 * matches what Node's resolver actually needs to load the module.
 */
export function isPackageInstalled(packageName: string): boolean {
  const modulePath = resolve(process.cwd(), 'node_modules', packageName)
  const manifestPath = resolve(modulePath, 'package.json')
  return existsSync(modulePath) && existsSync(manifestPath)
}

export type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun'

/**
 * Parse `npm_config_user_agent` to identify a non-npm runner.
 *
 * npm, pnpm, yarn, and bun all set this env var when they invoke a package
 * script or a `*x`/`dlx`-style runner. It starts with `"<tool>/<version> ..."`.
 *
 * We only trust non-npm values. `bunx`, `pnpm dlx`, and `yarn dlx` are
 * deliberate choices by the user. `npm`/`npx` is the default and often a
 * reflex invocation, so we don't let it override lockfile detection.
 */
function packageManagerFromUserAgent(): PackageManager | undefined {
  const ua = process.env.npm_config_user_agent
  if (!ua) return undefined
  if (ua.startsWith('bun/')) return 'bun'
  if (ua.startsWith('pnpm/')) return 'pnpm'
  if (ua.startsWith('yarn/')) return 'yarn'
  return undefined
}

/**
 * Detect the package manager used for the current project.
 *
 * Priority:
 *  1. `npm_config_user_agent` — when the user explicitly invokes via
 *     `bunx`/`pnpm dlx`/`yarn dlx`, honour that choice even in projects
 *     without a matching lockfile (e.g. fresh projects).
 *  2. Lockfile in cwd — respects the existing project convention.
 *  3. Default to `npm`.
 */
export function detectPackageManager(): PackageManager {
  const fromUserAgent = packageManagerFromUserAgent()
  if (fromUserAgent) return fromUserAgent

  const cwd = process.cwd()
  if (
    existsSync(resolve(cwd, 'bun.lockb')) ||
    existsSync(resolve(cwd, 'bun.lock'))
  )
    return 'bun'
  if (existsSync(resolve(cwd, 'pnpm-lock.yaml'))) return 'pnpm'
  if (existsSync(resolve(cwd, 'yarn.lock'))) return 'yarn'
  return 'npm'
}

/** Returns the install command for adding a production dependency with the given package manager. */
export function prodInstallCommand(
  pm: ReturnType<typeof detectPackageManager>,
  packageName: string,
): string {
  switch (pm) {
    case 'bun':
      return `bun add ${packageName}`
    case 'pnpm':
      return `pnpm add ${packageName}`
    case 'yarn':
      return `yarn add ${packageName}`
    case 'npm':
      return `npm install ${packageName}`
  }
}

/** Returns the install command for adding a dev dependency with the given package manager. */
export function devInstallCommand(
  pm: ReturnType<typeof detectPackageManager>,
  packageName: string,
): string {
  switch (pm) {
    case 'bun':
      return `bun add -D ${packageName}`
    case 'pnpm':
      return `pnpm add -D ${packageName}`
    case 'yarn':
      return `yarn add -D ${packageName}`
    case 'npm':
      return `npm install -D ${packageName}`
  }
}

/**
 * Build the install command(s) that add multiple dependencies at once.
 * npm/pnpm/yarn/bun all accept a space-separated package list, so we
 * use the existing `prodInstallCommand` / `devInstallCommand` builders
 * with a joined argument. Returns one or two strings depending on
 * whether prod and dev lists are both non-empty.
 */
export function combinedInstallCommands(
  pm: PackageManager,
  prodPackages: string[],
  devPackages: string[],
): string[] {
  const commands: string[] = []
  if (prodPackages.length > 0) {
    commands.push(prodInstallCommand(pm, prodPackages.join(' ')))
  }
  if (devPackages.length > 0) {
    commands.push(devInstallCommand(pm, devPackages.join(' ')))
  }
  return commands
}

/**
 * Returns the one-shot remote-execution command for the given package
 * manager, ready to prefix a package reference. We mirror what each tool
 * documents:
 *   npm  → `npx`
 *   bun  → `bunx`
 *   pnpm → `pnpm dlx`
 *   yarn → `yarn dlx`
 *
 * `ref` is appended verbatim, so callers may pass `'stash'` or
 * `'stash db install'`.
 */
export function runnerCommand(pm: PackageManager, ref: string): string {
  switch (pm) {
    case 'bun':
      return `bunx ${ref}`
    case 'pnpm':
      return `pnpm dlx ${ref}`
    case 'yarn':
      return `yarn dlx ${ref}`
    case 'npm':
      return `npx ${ref}`
  }
}

function toCamelCase(str: string): string {
  return str.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())
}

function drizzleTsType(dataType: string): string {
  switch (dataType) {
    case 'number':
      return 'number'
    case 'boolean':
      return 'boolean'
    case 'date':
      return 'Date'
    case 'json':
      return 'Record<string, unknown>'
    default:
      return 'string'
  }
}

function generateDrizzleFromSchema(schema: SchemaDef): string {
  const varName = `${toCamelCase(schema.tableName)}Table`
  const schemaVarName = `${toCamelCase(schema.tableName)}Schema`

  const columnDefs = schema.columns.map((col) => {
    const opts: string[] = []
    if (col.dataType !== 'string') {
      opts.push(`dataType: '${col.dataType}'`)
    }
    if (col.searchOps.includes('equality')) {
      opts.push('equality: true')
    }
    if (col.searchOps.includes('orderAndRange')) {
      opts.push('orderAndRange: true')
    }
    if (col.searchOps.includes('freeTextSearch')) {
      opts.push('freeTextSearch: true')
    }

    const tsType = drizzleTsType(col.dataType)
    const optsStr =
      opts.length > 0 ? `, {\n    ${opts.join(',\n    ')},\n  }` : ''
    return `  ${col.name}: encryptedType<${tsType}>('${col.name}'${optsStr}),`
  })

  return `import { pgTable, integer, timestamp } from 'drizzle-orm/pg-core'
import { encryptedType, extractEncryptionSchema } from '@cipherstash/stack/drizzle'
import { Encryption } from '@cipherstash/stack'

export const ${varName} = pgTable('${schema.tableName}', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
${columnDefs.join('\n')}
  createdAt: timestamp('created_at').defaultNow(),
})

const ${schemaVarName} = extractEncryptionSchema(${varName})

export const encryptionClient = await Encryption({
  schemas: [${schemaVarName}],
})
`
}

function generateSchemaFromDef(schema: SchemaDef): string {
  const varName = `${toCamelCase(schema.tableName)}Table`

  const columnDefs = schema.columns.map((col) => {
    const parts: string[] = [`  ${col.name}: encryptedColumn('${col.name}')`]

    if (col.dataType !== 'string') {
      parts.push(`.dataType('${col.dataType}')`)
    }

    for (const op of col.searchOps) {
      parts.push(`.${op}()`)
    }

    return `${parts.join('\n    ')},`
  })

  return `import { encryptedTable, encryptedColumn } from '@cipherstash/stack/schema'
import { Encryption } from '@cipherstash/stack'

export const ${varName} = encryptedTable('${schema.tableName}', {
${columnDefs.join('\n')}
})

export const encryptionClient = await Encryption({
  schemas: [${varName}],
})
`
}

/** Generates the encryption client file contents for a given integration and schema. */
export function generateClientFromSchema(
  integration: Integration,
  schema: SchemaDef,
): string {
  switch (integration) {
    case 'drizzle':
      return generateDrizzleFromSchema(schema)
    case 'supabase':
    case 'postgresql':
      return generateSchemaFromDef(schema)
  }
}

function generateDrizzleFromSchemas(schemas: SchemaDef[]): string {
  const tableDefs = schemas.map((schema) => {
    const varName = `${toCamelCase(schema.tableName)}Table`
    const schemaVarName = `${toCamelCase(schema.tableName)}Schema`

    const columnDefs = schema.columns.map((col) => {
      const opts: string[] = []
      if (col.dataType !== 'string') {
        opts.push(`dataType: '${col.dataType}'`)
      }
      if (col.searchOps.includes('equality')) {
        opts.push('equality: true')
      }
      if (col.searchOps.includes('orderAndRange')) {
        opts.push('orderAndRange: true')
      }
      if (col.searchOps.includes('freeTextSearch')) {
        opts.push('freeTextSearch: true')
      }

      const tsType = drizzleTsType(col.dataType)
      const optsStr =
        opts.length > 0 ? `, {\n    ${opts.join(',\n    ')},\n  }` : ''
      return `  ${col.name}: encryptedType<${tsType}>('${col.name}'${optsStr}),`
    })

    return `export const ${varName} = pgTable('${schema.tableName}', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
${columnDefs.join('\n')}
  createdAt: timestamp('created_at').defaultNow(),
})

const ${schemaVarName} = extractEncryptionSchema(${varName})`
  })

  const schemaVarNames = schemas.map((s) => `${toCamelCase(s.tableName)}Schema`)

  return `import { pgTable, integer, timestamp } from 'drizzle-orm/pg-core'
import { encryptedType, extractEncryptionSchema } from '@cipherstash/stack/drizzle'
import { Encryption } from '@cipherstash/stack'

${tableDefs.join('\n\n')}

export const encryptionClient = await Encryption({
  schemas: [${schemaVarNames.join(', ')}],
})
`
}

function generateGenericFromSchemas(schemas: SchemaDef[]): string {
  const tableDefs = schemas.map((schema) => {
    const varName = `${toCamelCase(schema.tableName)}Table`

    const columnDefs = schema.columns.map((col) => {
      const parts: string[] = [`  ${col.name}: encryptedColumn('${col.name}')`]

      if (col.dataType !== 'string') {
        parts.push(`.dataType('${col.dataType}')`)
      }

      for (const op of col.searchOps) {
        parts.push(`.${op}()`)
      }

      return `${parts.join('\n    ')},`
    })

    return `export const ${varName} = encryptedTable('${schema.tableName}', {
${columnDefs.join('\n')}
})`
  })

  const tableVarNames = schemas.map((s) => `${toCamelCase(s.tableName)}Table`)

  return `import { encryptedTable, encryptedColumn } from '@cipherstash/stack/schema'
import { Encryption } from '@cipherstash/stack'

${tableDefs.join('\n\n')}

export const encryptionClient = await Encryption({
  schemas: [${tableVarNames.join(', ')}],
})
`
}

/**
 * Generate the encryption client file contents for one or more schemas.
 *
 * The single-schema variants above are kept for the placeholder path (which
 * is always exactly one table); this is the variant that renders a real
 * multi-table client from DB introspection.
 */
export function generateClientFromSchemas(
  integration: Integration,
  schemas: SchemaDef[],
): string {
  switch (integration) {
    case 'drizzle':
      return generateDrizzleFromSchemas(schemas)
    case 'supabase':
    case 'postgresql':
      return generateGenericFromSchemas(schemas)
  }
}

/**
 * Schema definition we ship as the "fresh project" placeholder. Exported
 * separately so steps that follow `build-schema` (gather-context, handoff)
 * can read it back without re-parsing the generated client file.
 */
export const PLACEHOLDER_SCHEMA: SchemaDef = {
  tableName: 'users',
  columns: [
    {
      name: 'email',
      dataType: 'string',
      searchOps: ['equality', 'freeTextSearch'],
    },
    {
      name: 'name',
      dataType: 'string',
      searchOps: ['equality', 'freeTextSearch'],
    },
  ],
}

/** Generates an encryption client file with a placeholder schema for getting started. */
export function generatePlaceholderClient(integration: Integration): string {
  return generateClientFromSchema(integration, PLACEHOLDER_SCHEMA)
}
