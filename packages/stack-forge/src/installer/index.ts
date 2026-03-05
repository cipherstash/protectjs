import pg from 'pg'

const EQL_INSTALL_URL =
  'https://github.com/cipherstash/encrypt-query-language/releases/latest/download/cipherstash-encrypt.sql'
const EQL_INSTALL_NO_OPERATOR_FAMILY_URL =
  'https://github.com/cipherstash/encrypt-query-language/releases/latest/download/cipherstash-encrypt-supabase.sql'
const EQL_SCHEMA_NAME = 'eql_v2'

export interface PermissionCheckResult {
  ok: boolean
  missing: string[]
}

export class EQLInstaller {
  private readonly databaseUrl: string

  constructor(options: { databaseUrl: string }) {
    this.databaseUrl = options.databaseUrl
  }

  /**
   * Check whether the connected database role has the permissions required
   * to install EQL.
   *
   * EQL installation requires:
   * - SUPERUSER or CREATEDB — for `CREATE EXTENSION IF NOT EXISTS pgcrypto`
   * - CREATE on the current database — for `CREATE SCHEMA eql_v2`
   * - CREATE on the public schema — for `CREATE TYPE public.eql_v2_encrypted`
   */
  async checkPermissions(): Promise<PermissionCheckResult> {
    const client = new pg.Client({ connectionString: this.databaseUrl })

    try {
      await client.connect()

      const missing: string[] = []

      // Check if the role is a superuser (can do everything)
      const roleResult = await client.query(`
        SELECT
          rolsuper,
          rolcreatedb
        FROM pg_roles
        WHERE rolname = current_user
      `)

      const role = roleResult.rows[0]
      const isSuperuser = role?.rolsuper === true

      if (isSuperuser) {
        return { ok: true, missing: [] }
      }

      // Not a superuser — check individual permissions

      // CREATE on the current database (needed for CREATE SCHEMA, CREATE EXTENSION)
      const dbCreateResult = await client.query(`
        SELECT has_database_privilege(current_user, current_database(), 'CREATE') AS has_create
      `)
      if (!dbCreateResult.rows[0]?.has_create) {
        missing.push('CREATE on database (required for CREATE SCHEMA and CREATE EXTENSION)')
      }

      // CREATE on the public schema (needed for CREATE TYPE public.eql_v2_encrypted)
      const schemaCreateResult = await client.query(`
        SELECT has_schema_privilege(current_user, 'public', 'CREATE') AS has_create
      `)
      if (!schemaCreateResult.rows[0]?.has_create) {
        missing.push('CREATE on public schema (required for CREATE TYPE public.eql_v2_encrypted)')
      }

      // Check if pgcrypto is already installed — if not, we need CREATE EXTENSION privilege
      const pgcryptoResult = await client.query(`
        SELECT 1 FROM pg_extension WHERE extname = 'pgcrypto'
      `)
      if (pgcryptoResult.rowCount === 0 || pgcryptoResult.rowCount === null) {
        // pgcrypto not installed — need to be able to create extensions
        // This typically requires superuser or the role must be the extension owner
        if (!role?.rolcreatedb) {
          missing.push('SUPERUSER or extension owner (required for CREATE EXTENSION pgcrypto)')
        }
      }

      return { ok: missing.length === 0, missing }
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      throw new Error(
        `Failed to connect to database: ${detail}`,
        { cause: error },
      )
    } finally {
      await client.end()
    }
  }

  /**
   * Check whether the EQL extension is installed by looking for the `eql_v2` schema.
   */
  async isInstalled(): Promise<boolean> {
    const client = new pg.Client({ connectionString: this.databaseUrl })

    try {
      await client.connect()

      const result = await client.query(
        'SELECT schema_name FROM information_schema.schemata WHERE schema_name = $1',
        [EQL_SCHEMA_NAME],
      )

      return result.rowCount !== null && result.rowCount > 0
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      throw new Error(
        `Failed to connect to database: ${detail}`,
        { cause: error },
      )
    } finally {
      await client.end()
    }
  }

  /**
   * Return the installed EQL version, or `null` if EQL is not installed.
   *
   * This is best-effort: if the schema exists but no version metadata is
   * available, `'unknown'` is returned.
   */
  async getInstalledVersion(): Promise<string | null> {
    const client = new pg.Client({ connectionString: this.databaseUrl })

    try {
      await client.connect()

      const schemaResult = await client.query(
        'SELECT schema_name FROM information_schema.schemata WHERE schema_name = $1',
        [EQL_SCHEMA_NAME],
      )

      if (schemaResult.rowCount === null || schemaResult.rowCount === 0) {
        return null
      }

      // Attempt to read a version from the schema — the EQL extension may
      // expose a `version()` function or a `version` table. If neither exists
      // we fall back to 'unknown'.
      try {
        const versionResult = await client.query(
          `SELECT ${EQL_SCHEMA_NAME}.version() AS version`,
        )

        if (versionResult.rows.length > 0 && versionResult.rows[0].version) {
          return String(versionResult.rows[0].version)
        }
      } catch {
        // version() function does not exist — that's fine
      }

      return 'unknown'
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      throw new Error(
        `Failed to connect to database: ${detail}`,
        { cause: error },
      )
    } finally {
      await client.end()
    }
  }

  /**
   * Install the CipherStash EQL PostgreSQL extension.
   *
   * Downloads the SQL install script from GitHub and executes it against the
   * target database inside a transaction. The script is idempotent and safe to
   * re-run.
   *
   * This method is intentionally "silent" — it does not produce any console
   * output. The calling CLI command is responsible for all user-facing output.
   */
  async install(options?: {
    excludeOperatorFamily?: boolean
    supabase?: boolean
  }): Promise<void> {
    const { supabase = false } = options ?? {}
    const excludeOperatorFamily = options?.excludeOperatorFamily || supabase
    const sql = await this.downloadInstallScript(excludeOperatorFamily)

    const client = new pg.Client({ connectionString: this.databaseUrl })

    try {
      await client.connect()
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      throw new Error(
        `Failed to connect to database: ${detail}`,
        { cause: error },
      )
    }

    try {
      await client.query('BEGIN')
      await client.query(sql)

      if (supabase) {
        await this.grantSupabasePermissions(client)
      }

      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {
        // Swallow rollback errors — the original error is more important.
      })

      const detail = error instanceof Error ? error.message : String(error)
      throw new Error(`Failed to install EQL: ${detail}`, {
        cause: error,
      })
    } finally {
      await client.end()
    }
  }

  /**
   * Grant Supabase roles access to the eql_v2 schema.
   *
   * Supabase uses dedicated roles (anon, authenticated, service_role) that
   * don't own the schema, so explicit grants are required.
   */
  private async grantSupabasePermissions(client: pg.Client): Promise<void> {
    const roles = 'anon, authenticated, service_role'

    await client.query(`GRANT USAGE ON SCHEMA ${EQL_SCHEMA_NAME} TO ${roles}`)
    await client.query(`GRANT ALL ON ALL TABLES IN SCHEMA ${EQL_SCHEMA_NAME} TO ${roles}`)
    await client.query(`GRANT ALL ON ALL ROUTINES IN SCHEMA ${EQL_SCHEMA_NAME} TO ${roles}`)
    await client.query(`GRANT ALL ON ALL SEQUENCES IN SCHEMA ${EQL_SCHEMA_NAME} TO ${roles}`)
    await client.query(`ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA ${EQL_SCHEMA_NAME} GRANT ALL ON TABLES TO ${roles}`)
    await client.query(`ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA ${EQL_SCHEMA_NAME} GRANT ALL ON ROUTINES TO ${roles}`)
    await client.query(`ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA ${EQL_SCHEMA_NAME} GRANT ALL ON SEQUENCES TO ${roles}`)
  }

  /**
   * Download the EQL SQL install script from GitHub.
   */
  private async downloadInstallScript(
    excludeOperatorFamily: boolean,
  ): Promise<string> {
    const url = excludeOperatorFamily
      ? EQL_INSTALL_NO_OPERATOR_FAMILY_URL
      : EQL_INSTALL_URL

    let response: Response

    try {
      response = await fetch(url)
    } catch (error) {
      throw new Error('Failed to download EQL install script from GitHub.', {
        cause: error,
      })
    }

    if (!response.ok) {
      throw new Error(
        `Failed to download EQL install script from GitHub. HTTP ${response.status}: ${response.statusText}`,
      )
    }

    return response.text()
  }
}
