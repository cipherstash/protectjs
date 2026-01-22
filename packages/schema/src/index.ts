import { z } from 'zod'

// ------------------------
// Zod schemas
// ------------------------

/**
 * Allowed cast types for CipherStash schema fields.
 *
 * **Possible values:**
 * - `"bigint"`
 * - `"boolean"`
 * - `"date"`
 * - `"number"`
 * - `"string"`
 * - `"json"`
 *
 * @remarks
 * This is a Zod enum used at runtime to validate schema definitions.
 * Use {@link CastAs} when typing your own code.
 */
export const castAsEnum = z
  .enum(['bigint', 'boolean', 'date', 'number', 'string', 'json'])
  .default('string')

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

/**
 * Schema for the full encryption configuration object.
 */
export const encryptConfigSchema = z.object({
  v: z.number(),
  tables: tablesSchema,
})

// ------------------------
// Type definitions
// ------------------------

/**
 * Type-safe alias for {@link castAsEnum} used to specify the *unencrypted* data type of a column or value.
 * This is important because once encrypted, all data is stored as binary blobs.
 *
 * @see {@link castAsEnum} for possible values.
 */
export type CastAs = z.infer<typeof castAsEnum>
export type TokenFilter = z.infer<typeof tokenFilterSchema>
export type MatchIndexOpts = z.infer<typeof matchIndexOptsSchema>
export type SteVecIndexOpts = z.infer<typeof steVecIndexOptsSchema>
export type UniqueIndexOpts = z.infer<typeof uniqueIndexOptsSchema>
export type OreIndexOpts = z.infer<typeof oreIndexOptsSchema>
export type ColumnSchema = z.infer<typeof columnSchema>

/**
 * Represents the structure of columns in a table, supporting both flat columns and nested objects.
 */
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

/**
 * Represents a value in a nested object within a Protect.js schema.
 *
 * Nested objects are useful for data stores with less structure, like NoSQL databases.
 * Use {@link csValue} to define these.
 *
 * @remarks
 * - Searchable encryption is **not supported** on nested `csValue` objects.
 * - For searchable JSON data in SQL databases, use `.searchableJson()` on a {@link ProtectColumn} instead.
 * - Maximum nesting depth is 3 levels.
 *
 * @example
 * ```typescript
 * profile: {
 *   name: csValue("profile.name"),
 *   address: {
 *     street: csValue("profile.address.street"),
 *   }
 * }
 * ```
 */
export class ProtectValue {
  private valueName: string
  private castAsValue: CastAs

  constructor(valueName: string) {
    this.valueName = valueName
    this.castAsValue = 'string'
  }

  /**
   * Set or override the unencrypted data type for this value.
   * Defaults to `'string'`.
   */
  dataType(castAs: CastAs) {
    this.castAsValue = castAs
    return this
  }

  /**
   * @internal
   */
  build() {
    return {
      cast_as: this.castAsValue,
      indexes: {},
    }
  }

  /**
   * Get the internal name of the value.
   */
  getName() {
    return this.valueName
  }
}

/**
 * Represents a database column in a Protect.js schema.
 * Use {@link csColumn} to define these.
 *
 * Chaining index methods enables searchable encryption for this column.
 *
 * @example
 * ```typescript
 * email: csColumn("email").equality().freeTextSearch()
 * ```
 */
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
    this.castAsValue = 'string'
  }

  /**
   * Set or override the unencrypted data type for this column.
   * Defaults to `'string'`.
   */
  dataType(castAs: CastAs) {
    this.castAsValue = castAs
    return this
  }

  /**
   * Enable ORE indexing (Order-Revealing Encryption) for range queries (`<`, `>`, `BETWEEN`).
   *
   * SQL Equivalent: `ORDER BY column ASC` or `WHERE column > 10`
   *
   * @see {@link https://cipherstash.com/docs/platform/searchable-encryption/supported-queries/range | Range Queries}
   */
  orderAndRange() {
    this.indexesValue.ore = {}
    return this
  }

  /**
   * Enable an Exact index for equality matching.
   *
   * SQL Equivalent: `WHERE column = 'value'`
   *
   * @param tokenFilters Optional filters like downcasing.
   * @see {@link https://cipherstash.com/docs/platform/searchable-encryption/supported-queries/exact | Exact Queries}
   */
  equality(tokenFilters?: TokenFilter[]) {
    this.indexesValue.unique = {
      token_filters: tokenFilters ?? [],
    }
    return this
  }

  /**
   * Enable a Match index for free-text search (fuzzy/substring matching).
   *
   * SQL Equivalent: `WHERE column LIKE '%substring%'`
   *
   * @param opts Custom match options for tokenizer, k, m, etc.
   * @see {@link https://cipherstash.com/docs/platform/searchable-encryption/supported-queries/match | Match Queries}
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
   * Enable a Structured Text Encryption Vector (STE Vec) index for searchable JSON columns.
   *
   * This automatically sets the column data type to `'json'` and configures the index
   * required for path selection (`->`, `->>`) and containment (`@>`, `<@`) queries.
   *
   * @remarks
   * **Mutual Exclusivity:** `searchableJson()` cannot be combined with `equality()`,
   * `freeTextSearch()`, or `orderAndRange()` on the same column.
   *
   * SQL Equivalent: `WHERE data->'user'->>'email' = '...'`
   *
   * @see {@link https://cipherstash.com/docs/platform/searchable-encryption/supported-queries/json | JSON Queries}
   */
  searchableJson() {
    this.castAsValue = 'json'
    // Use column name as temporary prefix; will be replaced with table/column during table build
    this.indexesValue.ste_vec = { prefix: this.columnName }
    return this
  }

  /**
   * @internal
   */
  build() {
    return {
      cast_as: this.castAsValue,
      indexes: this.indexesValue,
    }
  }

  /**
   * Get the database column name.
   */
  getName() {
    return this.columnName
  }
}

interface TableDefinition {
  tableName: string
  columns: Record<string, ColumnSchema>
}

/**
 * Represents a database table in a Protect.js schema.
 * Collections of columns are mapped here.
 */
export class ProtectTable<T extends ProtectTableColumn> {
  constructor(
    public readonly tableName: string,
    private readonly columnBuilders: T,
  ) {}

  /**
   * Build the final table definition used for configuration.
   * @internal
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
        const builtColumn = builder.build()

        // Set ste_vec prefix to table/column (overwriting any temporary prefix)
        if (builtColumn.indexes.ste_vec) {
          builtColumns[colName] = {
            ...builtColumn,
            indexes: {
              ...builtColumn.indexes,
              ste_vec: {
                prefix: `${this.tableName}/${colName}`,
              },
            },
          }
        } else {
          builtColumns[colName] = builtColumn
        }
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

/**
 * Define a database table and its columns for encryption and indexing.
 *
 * @param tableName The name of the table in your database.
 * @param columns An object mapping TypeScript property names to database columns or nested objects.
 *
 * @example
 * ```typescript
 * export const users = csTable("users", {
 *   email: csColumn("email").equality(),
 *   profile: {
 *     name: csValue("profile.name"),
 *   }
 * });
 * ```
 */
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

/**
 * Define a database column for encryption. Use method chaining to enable indexes.
 *
 * @param columnName The name of the column in your database.
 *
 * @example
 * ```typescript
 * csColumn("email").equality().orderAndRange()
 * ```
 */
export function csColumn(columnName: string) {
  return new ProtectColumn(columnName)
}

/**
 * Define a value within a nested object.
 *
 * @param valueName A dot-separated string representing the path, e.g., "profile.name".
 *
 * @remarks
 * Nested objects defined with `csValue` are encrypted as part of the parent but are **not searchable**.
 * For searchable JSON, use `.searchableJson()` on a {@link csColumn}.
 */
export function csValue(valueName: string) {
  return new ProtectValue(valueName)
}

// ------------------------
// Internal functions
// ------------------------

/**
 * Build the full encryption configuration from one or more tables.
 * Used internally during Protect client initialization.
 *
 * @param protectTables One or more table definitions created with {@link csTable}.
 */
export function buildEncryptConfig(
  ...protectTables: Array<ProtectTable<ProtectTableColumn>>
): EncryptConfig {
  const config: EncryptConfig = {
    v: 2,
    tables: {},
  }

  for (const tb of protectTables) {
    const tableDef = tb.build()
    const tableName = tableDef.tableName

    // Set ste_vec prefix to table/column (overwriting any temporary prefix)
    for (const [columnName, columnConfig] of Object.entries(tableDef.columns)) {
      if (columnConfig.indexes.ste_vec) {
        columnConfig.indexes.ste_vec.prefix = `${tableName}/${columnName}`
      }
    }

    config.tables[tableName] = tableDef.columns
  }

  return config
}