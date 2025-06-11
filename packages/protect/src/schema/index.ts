import { z } from 'zod'

// ------------------------
// Zod schemas
// ------------------------
const castAsEnum = z
  .enum([
    'big_int',
    'boolean',
    'date',
    'real',
    'double',
    'int',
    'small_int',
    'text',
    'jsonb',
  ])
  .default('text')

const tokenFilterSchema = z.object({
  kind: z.literal('downcase'),
})

const tokenizerSchema = z
  .union([
    z.object({
      kind: z.literal('standard'),
    }),
    z.object({
      kind: z.literal('ngram'),
      token_length: z.number(),
    }),
  ])
  .default({ kind: 'ngram', token_length: 3 })
  .optional()

const oreIndexOptsSchema = z.object({})

const uniqueIndexOptsSchema = z.object({
  token_filters: z.array(tokenFilterSchema).default([]).optional(),
})

const matchIndexOptsSchema = z.object({
  tokenizer: tokenizerSchema,
  token_filters: z.array(tokenFilterSchema).default([]).optional(),
  k: z.number().default(6).optional(),
  m: z.number().default(2048).optional(),
  include_original: z.boolean().default(false).optional(),
})

const steVecIndexOptsSchema = z.object({
  prefix: z.string(),
})

const indexesSchema = z
  .object({
    ore: oreIndexOptsSchema.optional(),
    unique: uniqueIndexOptsSchema.optional(),
    match: matchIndexOptsSchema.optional(),
    ste_vec: steVecIndexOptsSchema.optional(),
  })
  .default({})

const columnSchema = z
  .object({
    cast_as: castAsEnum,
    indexes: indexesSchema,
  })
  .default({})

const tableSchema = z.record(columnSchema).default({})

const tablesSchema = z.record(tableSchema).default({})

export const encryptConfigSchema = z.object({
  v: z.number(),
  tables: tablesSchema,
})

// ------------------------
// Type definitions
// ------------------------
type CastAs = z.infer<typeof castAsEnum>
type TokenFilter = z.infer<typeof tokenFilterSchema>
type MatchIndexOpts = z.infer<typeof matchIndexOptsSchema>
type SteVecIndexOpts = z.infer<typeof steVecIndexOptsSchema>
type UniqueIndexOpts = z.infer<typeof uniqueIndexOptsSchema>
type OreIndexOpts = z.infer<typeof oreIndexOptsSchema>
type ColumnSchema = z.infer<typeof columnSchema>

export type ProtectTableColumn = {
  [key: string]:
    | ProtectColumn
    | {
        [key: string]:
          | ProtectValue
          | {
              [key: string]:
                | ProtectValue
                | {
                    [key: string]: ProtectValue
                  }
            }
      }
}
export type EncryptConfig = z.infer<typeof encryptConfigSchema>

// ------------------------
// Interface definitions
// ------------------------
export class ProtectValue {
  private valueName: string
  private castAsValue: CastAs

  constructor(valueName: string) {
    this.valueName = valueName
    this.castAsValue = 'text'
  }

  /**
   * Set or override the cast_as value.
   */
  dataType(castAs: CastAs) {
    this.castAsValue = castAs
    return this
  }

  build() {
    return {
      cast_as: this.castAsValue,
      indexes: {},
    }
  }

  getName() {
    return this.valueName
  }
}

export class ProtectColumn {
  private columnName: string
  private castAsValue: CastAs
  private indexesValue: {
    ore?: OreIndexOpts
    unique?: UniqueIndexOpts
    match?: Required<MatchIndexOpts>
    ste_vec?: SteVecIndexOpts
  } = {}

  constructor(columnName: string) {
    this.columnName = columnName
    this.castAsValue = 'text'
  }

  /**
   * Set or override the cast_as value.
   */
  dataType(castAs: CastAs) {
    this.castAsValue = castAs
    return this
  }

  /**
   * Enable ORE indexing (Order-Revealing Encryption).
   */
  orderAndRange() {
    this.indexesValue.ore = {}
    return this
  }

  /**
   * Enable an Exact index. Optionally pass tokenFilters.
   */
  equality(tokenFilters?: TokenFilter[]) {
    this.indexesValue.unique = {
      token_filters: tokenFilters ?? [],
    }
    return this
  }

  /**
   * Enable a Match index. Allows passing of custom match options.
   */
  freeTextSearch(opts?: MatchIndexOpts) {
    // Provide defaults
    this.indexesValue.match = {
      tokenizer: opts?.tokenizer ?? { kind: 'ngram', token_length: 3 },
      token_filters: opts?.token_filters ?? [
        {
          kind: 'downcase',
        },
      ],
      k: opts?.k ?? 6,
      m: opts?.m ?? 2048,
      include_original: opts?.include_original ?? true,
    }
    return this
  }

  /**
   * Enable a STE Vec index, requires a prefix.
   */
  josn(prefix: string) {
    this.indexesValue.ste_vec = { prefix }
    return this
  }

  build() {
    return {
      cast_as: this.castAsValue,
      indexes: this.indexesValue,
    }
  }

  getName() {
    return this.columnName
  }
}

interface TableDefinition {
  tableName: string
  columns: Record<string, ColumnSchema>
}

export class ProtectTable<T extends ProtectTableColumn> {
  constructor(
    public readonly tableName: string,
    private readonly columnBuilders: T,
  ) {}

  /**
   * Build a TableDefinition object: tableName + built column configs.
   */
  build(): TableDefinition {
    const builtColumns: Record<string, ColumnSchema> = {}

    const processColumn = (
      builder:
        | ProtectColumn
        | Record<
            string,
            | ProtectValue
            | Record<
                string,
                | ProtectValue
                | Record<string, ProtectValue | Record<string, ProtectValue>>
              >
          >,
      colName: string,
    ) => {
      if (builder instanceof ProtectColumn) {
        builtColumns[colName] = builder.build()
      } else {
        for (const [key, value] of Object.entries(builder)) {
          if (value instanceof ProtectValue) {
            builtColumns[value.getName()] = value.build()
          } else {
            processColumn(value, key)
          }
        }
      }
    }

    for (const [colName, builder] of Object.entries(this.columnBuilders)) {
      processColumn(builder, colName)
    }

    return {
      tableName: this.tableName,
      columns: builtColumns,
    }
  }
}

// ------------------------
// User facing functions
// ------------------------
export function csTable<T extends ProtectTableColumn>(
  tableName: string,
  columns: T,
): ProtectTable<T> & T {
  const tableBuilder = new ProtectTable(tableName, columns) as ProtectTable<T> &
    T

  for (const [colName, colBuilder] of Object.entries(columns)) {
    ;(tableBuilder as ProtectTableColumn)[colName] = colBuilder
  }

  return tableBuilder
}

export function csColumn(columnName: string) {
  return new ProtectColumn(columnName)
}

export function csValue(valueName: string) {
  return new ProtectValue(valueName)
}

// ------------------------
// Internal functions
// ------------------------
export function buildEncryptConfig(
  ...protectTables: Array<ProtectTable<ProtectTableColumn>>
): EncryptConfig {
  const config: EncryptConfig = {
    v: 2,
    tables: {},
  }

  for (const tb of protectTables) {
    const tableDef = tb.build()
    config.tables[tableDef.tableName] = tableDef.columns
  }

  return config
}
