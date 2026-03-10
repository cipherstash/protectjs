import { execSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import * as p from '@clack/prompts'

type Integration = 'drizzle' | 'supabase' | 'postgresql'
type DataType = 'string' | 'number' | 'boolean' | 'date' | 'json'
type SearchOp = 'equality' | 'orderAndRange' | 'freeTextSearch'

interface ColumnDef {
  name: string
  dataType: DataType
  searchOps: SearchOp[]
}

interface SchemaDef {
  tableName: string
  columns: ColumnDef[]
}

const CONFIG_FILENAME = 'stash.config.ts'

export async function initCommand() {
  p.intro('stash-forge init')

  // Check if stash.config.ts already exists
  const configPath = resolve(process.cwd(), CONFIG_FILENAME)
  if (existsSync(configPath)) {
    p.log.warn(`${CONFIG_FILENAME} already exists. Skipping initialization.`)
    p.log.info(
      `Delete ${CONFIG_FILENAME} and re-run "stash-forge init" to start fresh.`,
    )
    p.outro('Nothing to do.')
    return
  }

  // 1. Check if @cipherstash/stack is installed, prompt to install if not
  const stackInstalled = isPackageInstalled('@cipherstash/stack')

  if (!stackInstalled) {
    const pm = detectPackageManager()
    const installCmd =
      pm === 'yarn'
        ? 'yarn add @cipherstash/stack'
        : `${pm} install @cipherstash/stack`

    const shouldInstall = await p.confirm({
      message: `@cipherstash/stack is not installed. Install it now? (${installCmd})`,
      initialValue: true,
    })

    if (p.isCancel(shouldInstall)) {
      p.cancel('Setup cancelled.')
      process.exit(0)
    }

    if (shouldInstall) {
      const s = p.spinner()
      s.start('Installing @cipherstash/stack...')

      try {
        execSync(installCmd, { stdio: 'pipe', encoding: 'utf-8' })
        s.stop('@cipherstash/stack installed.')
      } catch (error) {
        s.stop('Failed to install @cipherstash/stack.')
        p.log.error(
          error instanceof Error ? error.message : 'Unknown error occurred.',
        )
        p.log.info(`You can install it manually: ${installCmd}`)
        p.outro('Initialization aborted.')
        process.exit(1)
      }
    } else {
      p.log.info(
        'Continuing without @cipherstash/stack. You can install it later.',
      )
    }
  }

  // 2. Ask for database URL
  const databaseUrl = await p.text({
    message: 'What is your database URL?',
    placeholder: 'postgresql://user:password@localhost:5432/mydb',
    defaultValue: process.env.DATABASE_URL,
    initialValue: process.env.DATABASE_URL,
    validate(value) {
      if (!value || value.trim().length === 0) {
        return 'Database URL is required.'
      }
    },
  })

  if (p.isCancel(databaseUrl)) {
    p.cancel('Setup cancelled.')
    process.exit(0)
  }

  // 3. Ask which integration
  const integration = await p.select<Integration>({
    message: 'Which integration are you using?',
    options: [
      {
        value: 'drizzle',
        label: 'Drizzle ORM',
        hint: 'encryptedType column type with query operators',
      },
      {
        value: 'supabase',
        label: 'Supabase',
        hint: 'encryptedSupabase wrapper with transparent encryption',
      },
      {
        value: 'postgresql',
        label: 'Plain PostgreSQL',
        hint: 'encryptedTable/encryptedColumn with raw queries',
      },
    ],
  })

  if (p.isCancel(integration)) {
    p.cancel('Setup cancelled.')
    process.exit(0)
  }

  // 4. Ask for encryption client file path
  const clientPath = await p.text({
    message: 'Where should the encryption client file be created?',
    placeholder: './src/encryption/index.ts',
    defaultValue: './src/encryption/index.ts',
    initialValue: './src/encryption/index.ts',
    validate(value) {
      if (!value || value.trim().length === 0) {
        return 'Client file path is required.'
      }
      if (!value.endsWith('.ts')) {
        return 'Client file path must end with .ts'
      }
    },
  })

  if (p.isCancel(clientPath)) {
    p.cancel('Setup cancelled.')
    process.exit(0)
  }

  // 5. Check if encryption client already exists
  const resolvedClientPath = resolve(process.cwd(), clientPath)
  const clientExists = existsSync(resolvedClientPath)

  let schema: SchemaDef | undefined
  let skipClientGeneration = false

  if (clientExists) {
    p.log.warn(`${clientPath} already exists.`)

    const overwriteChoice = await p.select<'keep' | 'overwrite'>({
      message: 'What would you like to do?',
      options: [
        {
          value: 'keep',
          label: 'Keep existing file',
          hint: 'skip schema setup and keep your current encryption client',
        },
        {
          value: 'overwrite',
          label: 'Overwrite with a new schema',
          hint: 'replace the file with a new encryption schema',
        },
      ],
    })

    if (p.isCancel(overwriteChoice)) {
      p.cancel('Setup cancelled.')
      process.exit(0)
    }

    if (overwriteChoice === 'keep') {
      skipClientGeneration = true
    }
  }

  if (!skipClientGeneration) {
    // 6. Ask whether to build a schema or use a placeholder
    const schemaChoice = await p.select<'build' | 'placeholder'>({
      message: 'How would you like to set up your encryption schema?',
      options: [
        {
          value: 'build',
          label: 'Build a schema now',
          hint: 'interactive wizard to define your table and encrypted columns',
        },
        {
          value: 'placeholder',
          label: 'Use a placeholder schema',
          hint: 'generates an example schema you can edit later',
        },
      ],
    })

    if (p.isCancel(schemaChoice)) {
      p.cancel('Setup cancelled.')
      process.exit(0)
    }

    if (schemaChoice === 'build') {
      schema = await buildSchema()
      if (!schema) {
        p.cancel('Setup cancelled.')
        process.exit(0)
      }
    }
  }

  // 7. Generate stash.config.ts
  const configContent = generateConfig(clientPath)
  writeFileSync(configPath, configContent, 'utf-8')
  p.log.success(`Created ${CONFIG_FILENAME}`)

  // 8. Generate encryption client file
  if (skipClientGeneration) {
    p.log.info(`Keeping existing ${clientPath}`)
  } else {
    const clientDir = dirname(resolvedClientPath)
    mkdirSync(clientDir, { recursive: true })

    const clientContent = schema
      ? generateClientFromSchema(integration, schema)
      : generatePlaceholderClient(integration)
    writeFileSync(resolvedClientPath, clientContent, 'utf-8')
    p.log.success(`${clientExists ? 'Overwrote' : 'Created'} ${clientPath}`)
  }

  // 8. Print next steps
  const remainingSteps: string[] = []

  if (!stackInstalled && !isPackageInstalled('@cipherstash/stack')) {
    const pm = detectPackageManager()
    const installCmd =
      pm === 'yarn'
        ? 'yarn add @cipherstash/stack'
        : `${pm} install @cipherstash/stack`
    remainingSteps.push(`Install dependencies:\n   ${installCmd}`)
  }

  if (
    integration === 'supabase' &&
    !isPackageInstalled('@supabase/supabase-js')
  ) {
    const pm = detectPackageManager()
    const installCmd =
      pm === 'yarn'
        ? 'yarn add @supabase/supabase-js'
        : `${pm} install @supabase/supabase-js`
    remainingSteps.push(`Install Supabase client:\n   ${installCmd}`)
  }

  remainingSteps.push(
    'Set up your CipherStash credentials:\n   Sign in at https://dashboard.cipherstash.com/sign-in\n   Then set: CS_WORKSPACE_CRN, CS_CLIENT_ID, CS_CLIENT_KEY, CS_CLIENT_ACCESS_KEY',
    'Install the EQL extension in your database:\n   npx stash-forge install',
    `Edit your encryption schema in ${clientPath}`,
    '(Optional) Push your encryption schema if using CipherStash Proxy:\n   npx stash-forge push',
  )

  p.note(
    remainingSteps.map((s, i) => `${i + 1}. ${s}`).join('\n\n'),
    'Next Steps',
  )
  p.outro('CipherStash Forge initialized!')
}

// ---------------------------------------------------------------------------
// Interactive schema builder
// ---------------------------------------------------------------------------

async function buildSchema(): Promise<SchemaDef | undefined> {
  const tableName = await p.text({
    message: 'What is the name of your table?',
    placeholder: 'users',
    validate(value) {
      if (!value || value.trim().length === 0) {
        return 'Table name is required.'
      }
      if (!/^[a-z_][a-z0-9_]*$/i.test(value)) {
        return 'Table name must be a valid identifier (letters, numbers, underscores).'
      }
    },
  })

  if (p.isCancel(tableName)) return undefined

  const columns: ColumnDef[] = []

  p.log.info('Add encrypted columns to your table. You can add more later.')

  while (true) {
    const column = await addColumn(columns.length + 1)
    if (!column) return undefined // cancelled

    columns.push(column)

    const addMore = await p.confirm({
      message: 'Add another encrypted column?',
      initialValue: false,
    })

    if (p.isCancel(addMore)) return undefined
    if (!addMore) break
  }

  p.log.success(
    `Schema defined: ${tableName} with ${columns.length} encrypted column${columns.length !== 1 ? 's' : ''}`,
  )

  return { tableName, columns }
}

async function addColumn(index: number): Promise<ColumnDef | undefined> {
  const name = await p.text({
    message: `Column ${index} name:`,
    placeholder: index === 1 ? 'email' : 'name',
    validate(value) {
      if (!value || value.trim().length === 0) {
        return 'Column name is required.'
      }
      if (!/^[a-z_][a-z0-9_]*$/i.test(value)) {
        return 'Column name must be a valid identifier.'
      }
    },
  })

  if (p.isCancel(name)) return undefined

  const dataType = await p.select<DataType>({
    message: `Data type for "${name}":`,
    options: [
      { value: 'string', label: 'string', hint: 'text, email, name, etc.' },
      { value: 'number', label: 'number', hint: 'integer or decimal' },
      { value: 'boolean', label: 'boolean' },
      { value: 'date', label: 'date', hint: 'Date object' },
      { value: 'json', label: 'json', hint: 'structured JSON data' },
    ],
  })

  if (p.isCancel(dataType)) return undefined

  // Build search operation options based on data type
  const searchOptions: { value: SearchOp; label: string; hint: string }[] = [
    {
      value: 'equality',
      label: 'Exact match',
      hint: 'eq, neq, in',
    },
    {
      value: 'orderAndRange',
      label: 'Order and range',
      hint: 'gt, gte, lt, lte, between, sorting',
    },
  ]

  // Only offer free-text search for string types
  if (dataType === 'string') {
    searchOptions.push({
      value: 'freeTextSearch',
      label: 'Free-text search',
      hint: 'like, ilike, substring matching',
    })
  }

  const searchOps = await p.multiselect<SearchOp>({
    message: `Search operations for "${name}":`,
    options: searchOptions,
    required: false,
  })

  if (p.isCancel(searchOps)) return undefined

  return { name, dataType, searchOps }
}

// ---------------------------------------------------------------------------
// Code generation
// ---------------------------------------------------------------------------

function generateConfig(clientPath: string): string {
  return `import { defineConfig } from '@cipherstash/stack-forge'

export default defineConfig({
  databaseUrl: process.env.DATABASE_URL!,
  client: '${clientPath}',
})
`
}

function generateClientFromSchema(
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

function generatePlaceholderClient(integration: Integration): string {
  const placeholder: SchemaDef = {
    tableName: 'users',
    columns: [
      { name: 'email', dataType: 'string', searchOps: ['equality', 'freeTextSearch'] },
      { name: 'name', dataType: 'string', searchOps: ['equality', 'freeTextSearch'] },
    ],
  }

  switch (integration) {
    case 'drizzle':
      return generateDrizzleFromSchema(placeholder)
    case 'supabase':
    case 'postgresql':
      return generateSchemaFromDef(placeholder)
  }
}

function generateDrizzleFromSchema(schema: SchemaDef): string {
  const varName = toCamelCase(schema.tableName) + 'Table'
  const schemaVarName = toCamelCase(schema.tableName) + 'Schema'

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
    const optsStr = opts.length > 0 ? `, {\n    ${opts.join(',\n    ')},\n  }` : ''
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
  const varName = toCamelCase(schema.tableName) + 'Table'

  const columnDefs = schema.columns.map((col) => {
    const parts: string[] = [`  ${col.name}: encryptedColumn('${col.name}')`]

    if (col.dataType !== 'string') {
      parts.push(`.dataType('${col.dataType}')`)
    }

    for (const op of col.searchOps) {
      parts.push(`.${op}()`)
    }

    return parts.join('\n    ') + ','
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toCamelCase(str: string): string {
  return str.replace(/_([a-z])/g, (_, c) => c.toUpperCase())
}

function drizzleTsType(dataType: DataType): string {
  switch (dataType) {
    case 'string':
      return 'string'
    case 'number':
      return 'number'
    case 'boolean':
      return 'boolean'
    case 'date':
      return 'Date'
    case 'json':
      return 'Record<string, unknown>'
  }
}

function isPackageInstalled(packageName: string): boolean {
  try {
    require.resolve(`${packageName}/package.json`, {
      paths: [process.cwd()],
    })
    return true
  } catch {
    return false
  }
}

function detectPackageManager(): 'npm' | 'pnpm' | 'yarn' | 'bun' {
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
