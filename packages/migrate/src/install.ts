import type { ClientBase } from 'pg'

export const MIGRATIONS_SCHEMA_SQL = `
CREATE SCHEMA IF NOT EXISTS cipherstash;

CREATE TABLE IF NOT EXISTS cipherstash.cs_migrations (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  table_name     text NOT NULL,
  column_name    text NOT NULL,
  event          text NOT NULL,
  phase          text NOT NULL,
  cursor_value   text,
  rows_processed bigint,
  rows_total     bigint,
  details        jsonb,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cs_migrations_column_id_desc
  ON cipherstash.cs_migrations (table_name, column_name, id DESC);
`

export async function installMigrationsSchema(
  client: ClientBase,
): Promise<void> {
  await client.query(MIGRATIONS_SCHEMA_SQL)
}
