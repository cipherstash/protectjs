import type { ProtectClient } from '@cipherstash/protect/client'
import { PgDialect, pgTable } from 'drizzle-orm/pg-core'
import { describe, expect, it, vi } from 'vitest'
import { createProtectOperators, encryptedType } from '../src/pg'

const docsTable = pgTable('json_docs', {
  metadata: encryptedType<Record<string, unknown>>('metadata', {
    dataType: 'json',
    searchableJson: true,
  }),
})

function createMockProtectClient() {
  const encryptedSelector = '{"v":"encrypted-selector"}'
  const encryptQuery = vi.fn(async (terms: unknown[]) => ({
    data: terms.map(() => encryptedSelector),
  }))

  return {
    client: { encryptQuery } as unknown as ProtectClient,
    encryptQuery,
    encryptedSelector,
  }
}

describe('createProtectOperators JSONB selector typing', () => {
  it('casts jsonbPathQueryFirst selector params to eql_v2_encrypted', async () => {
    const { client, encryptQuery, encryptedSelector } =
      createMockProtectClient()
    const protectOps = createProtectOperators(client)
    const dialect = new PgDialect()

    const condition = await protectOps.jsonbPathQueryFirst(
      docsTable.metadata,
      '$.profile.email',
    )
    const query = dialect.sqlToQuery(condition)

    expect(query.sql).toMatch(
      /eql_v2\.jsonb_path_query_first\([^,]+,\s*\$\d+::eql_v2_encrypted\)/,
    )
    expect(query.params).toHaveLength(1)
    expect(typeof query.params[0]).toBe('string')
    expect(encryptQuery).toHaveBeenCalledTimes(1)
    expect(encryptQuery.mock.calls[0]?.[0]).toMatchObject([
      { queryType: 'steVecSelector' },
    ])
  })

  it('casts jsonbPathExists selector params to eql_v2_encrypted', async () => {
    const { client } = createMockProtectClient()
    const protectOps = createProtectOperators(client)
    const dialect = new PgDialect()

    const condition = await protectOps.jsonbPathExists(
      docsTable.metadata,
      '$.profile.email',
    )
    const query = dialect.sqlToQuery(condition)

    expect(query.sql).toMatch(
      /eql_v2\.jsonb_path_exists\([^,]+,\s*\$\d+::eql_v2_encrypted\)/,
    )
    expect(query.params).toHaveLength(1)
    expect(typeof query.params[0]).toBe('string')
  })

  it('casts jsonbGet selector params to eql_v2_encrypted', async () => {
    const { client } = createMockProtectClient()
    const protectOps = createProtectOperators(client)
    const dialect = new PgDialect()

    const condition = await protectOps.jsonbGet(
      docsTable.metadata,
      '$.profile.email',
    )
    const query = dialect.sqlToQuery(condition)

    expect(query.sql).toMatch(/->\s*\$\d+::eql_v2_encrypted/)
    expect(query.params).toHaveLength(1)
    expect(typeof query.params[0]).toBe('string')
  })
})
