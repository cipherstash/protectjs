import type { ProtectClient } from '@cipherstash/protect/client'
import { PgDialect } from 'drizzle-orm/pg-core'
import { vi } from 'vitest'
import { createProtectOperators } from '../src/pg'

export const ENCRYPTED_VALUE = '{"v":"encrypted-value"}'

export function createMockProtectClient() {
  const encryptQuery = vi.fn(async (terms: unknown[] | unknown) => ({
    data: Array.isArray(terms)
      ? terms.map(() => ENCRYPTED_VALUE)
      : [ENCRYPTED_VALUE],
  }))

  return {
    client: { encryptQuery } as unknown as ProtectClient,
    encryptQuery,
  }
}

export function setup() {
  const { client, encryptQuery } = createMockProtectClient()
  const protectOps = createProtectOperators(client)
  const dialect = new PgDialect()
  return { client, encryptQuery, protectOps, dialect }
}
