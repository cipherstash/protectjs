import type { Sequelize } from 'sequelize'

/**
 * Verifies that the eql_v2_encrypted composite type exists in PostgreSQL
 *
 * This type is provided by the EQL extension and must be installed
 * before using encrypted columns with Sequelize.
 *
 * @param sequelize - Sequelize instance connected to PostgreSQL
 * @returns Promise that resolves to true if type exists, false otherwise
 * @throws Error if not connected to PostgreSQL
 *
 * @example
 * ```typescript
 * import { Sequelize } from 'sequelize'
 * import { verifyEqlType } from '@cipherstash/sequelize'
 *
 * const sequelize = new Sequelize(DATABASE_URL)
 *
 * if (!(await verifyEqlType(sequelize))) {
 *   throw new Error('EQL extension not installed. Run the EQL installation SQL.')
 * }
 *
 * // Safe to use ENCRYPTED columns now
 * await sequelize.sync()
 * ```
 */
export async function verifyEqlType(sequelize: Sequelize): Promise<boolean> {
  // Ensure we're connected to PostgreSQL
  const dialect = sequelize.getDialect()
  if (dialect !== 'postgres') {
    throw new Error(
      `EQL extension is only available for PostgreSQL. Current dialect: ${dialect}`,
    )
  }

  try {
    // Query PostgreSQL system catalog for the type
    const [results] = await sequelize.query(
      `SELECT 1 FROM pg_type WHERE typname = 'eql_v2_encrypted'`,
      { type: 'SELECT' },
    )

    return results.length > 0
  } catch (error) {
    throw new Error(
      `Failed to verify eql_v2_encrypted type: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

/**
 * Ensures that the eql_v2_encrypted type exists, throwing an error if not
 *
 * @param sequelize - Sequelize instance connected to PostgreSQL
 * @throws Error if type doesn't exist or verification fails
 *
 * @example
 * ```typescript
 * import { Sequelize } from 'sequelize'
 * import { ensureEqlType } from '@cipherstash/sequelize'
 *
 * const sequelize = new Sequelize(DATABASE_URL)
 *
 * // Throws error if EQL extension not installed
 * await ensureEqlType(sequelize)
 *
 * // Safe to sync
 * await sequelize.sync()
 * ```
 */
export async function ensureEqlType(sequelize: Sequelize): Promise<void> {
  const exists = await verifyEqlType(sequelize)

  if (!exists) {
    throw new Error(
      'PostgreSQL type "eql_v2_encrypted" not found. ' +
        'Install the EQL extension before using encrypted columns. ' +
        'See: https://docs.cipherstash.com/reference/eql',
    )
  }
}

/**
 * Gets information about the eql_v2_encrypted composite type
 *
 * @param sequelize - Sequelize instance connected to PostgreSQL
 * @returns Type information including schema, name, and attributes
 *
 * @example
 * ```typescript
 * const typeInfo = await getEqlTypeInfo(sequelize)
 * console.log(typeInfo)
 * // {
 * //   schema: 'public',
 * //   typname: 'eql_v2_encrypted',
 * //   attributes: [{ attname: 'data', typname: 'jsonb' }]
 * // }
 * ```
 */
export async function getEqlTypeInfo(sequelize: Sequelize): Promise<{
  schema: string
  typname: string
  attributes: Array<{ attname: string; typname: string }>
} | null> {
  const dialect = sequelize.getDialect()
  if (dialect !== 'postgres') {
    throw new Error(
      `EQL extension is only available for PostgreSQL. Current dialect: ${dialect}`,
    )
  }

  try {
    // Query type information from PostgreSQL catalog
    const [results] = await sequelize.query(
      `
      SELECT
        n.nspname as schema,
        t.typname,
        jsonb_agg(
          jsonb_build_object(
            'attname', a.attname,
            'typname', bt.typname
          ) ORDER BY a.attnum
        ) as attributes
      FROM pg_type t
      JOIN pg_namespace n ON t.typnamespace = n.oid
      LEFT JOIN pg_attribute a ON t.typrelid = a.attrelid AND a.attnum > 0
      LEFT JOIN pg_type bt ON a.atttypid = bt.oid
      WHERE t.typname = 'eql_v2_encrypted'
      GROUP BY n.nspname, t.typname
      `,
      { type: 'SELECT' },
    )

    if (results.length === 0) {
      return null
    }

    // biome-ignore lint/suspicious/noExplicitAny: raw query result type
    return results[0] as any
  } catch (error) {
    throw new Error(
      `Failed to get eql_v2_encrypted type info: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}
