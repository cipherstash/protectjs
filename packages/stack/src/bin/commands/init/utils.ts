import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Integration, SchemaDef } from './types.js'

/**
 * Checks if a package is installed in the current project by looking
 * for its directory in node_modules.
 */
export function isPackageInstalled(packageName: string): boolean {
  const modulePath = resolve(process.cwd(), 'node_modules', packageName)
  return existsSync(modulePath)
}

/** Detects the package manager used in the current project by checking lock files. */
export function detectPackageManager(): 'npm' | 'pnpm' | 'yarn' | 'bun' {
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

/** Generates an encryption client file with a placeholder schema for getting started. */
export function generatePlaceholderClient(integration: Integration): string {
  const placeholder: SchemaDef = {
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

  return generateClientFromSchema(integration, placeholder)
}
