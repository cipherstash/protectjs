import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import * as p from '@clack/prompts'
import type {
  ColumnDef,
  DataType,
  InitProvider,
  InitState,
  InitStep,
  SearchOp,
} from '../types.js'
import { CancelledError, toIntegration } from '../types.js'
import {
  generateClientFromSchema,
  generatePlaceholderClient,
} from '../utils.js'

const DEFAULT_CLIENT_PATH = './src/encryption/index.ts'

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

  const searchOptions: Array<{ value: SearchOp; label: string; hint: string }> =
    [
      { value: 'equality', label: 'Exact match', hint: 'eq, neq, in' },
      {
        value: 'orderAndRange',
        label: 'Order and range',
        hint: 'gt, gte, lt, lte, between, sorting',
      },
    ]

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

async function buildSchema(): Promise<
  { tableName: string; columns: ColumnDef[] } | undefined
> {
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
    if (!column) return undefined

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

export const buildSchemaStep: InitStep = {
  id: 'build-schema',
  name: 'Build encryption schema',
  async run(state: InitState, _provider: InitProvider): Promise<InitState> {
    if (!state.connectionMethod) {
      p.log.warn('Skipping schema generation (no connection method selected)')
      return { ...state, schemaGenerated: false }
    }

    const integration = toIntegration(state.connectionMethod)

    const clientFilePath = await p.text({
      message: 'Where should we create your encryption client?',
      placeholder: DEFAULT_CLIENT_PATH,
      defaultValue: DEFAULT_CLIENT_PATH,
    })

    if (p.isCancel(clientFilePath)) throw new CancelledError()

    const resolvedPath = resolve(process.cwd(), clientFilePath)

    // If the file already exists, ask what to do
    if (existsSync(resolvedPath)) {
      const action = await p.select({
        message: `${clientFilePath} already exists. What would you like to do?`,
        options: [
          {
            value: 'keep',
            label: 'Keep existing file',
            hint: 'skip code generation',
          },
          { value: 'overwrite', label: 'Overwrite with new schema' },
        ],
      })

      if (p.isCancel(action)) throw new CancelledError()

      if (action === 'keep') {
        p.log.info('Keeping existing encryption client file.')
        return { ...state, clientFilePath, schemaGenerated: false }
      }
    }

    // Ask whether to build a schema interactively or use a placeholder
    const schemaChoice = await p.select({
      message: 'How would you like to set up your encryption schema?',
      options: [
        {
          value: 'build',
          label: 'Build schema now',
          hint: 'interactive wizard',
        },
        {
          value: 'placeholder',
          label: 'Use placeholder schema',
          hint: 'edit later',
        },
      ],
    })

    if (p.isCancel(schemaChoice)) throw new CancelledError()

    let fileContents: string

    if (schemaChoice === 'build') {
      const schema = await buildSchema()
      if (!schema) throw new CancelledError()
      fileContents = generateClientFromSchema(integration, schema)
    } else {
      fileContents = generatePlaceholderClient(integration)
    }

    // Write the file
    const dir = dirname(resolvedPath)
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }

    writeFileSync(resolvedPath, fileContents, 'utf-8')
    p.log.success(`Encryption client written to ${clientFilePath}`)

    return { ...state, clientFilePath, schemaGenerated: true }
  },
}
