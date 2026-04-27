import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockConnect = vi.fn()
const mockQuery = vi.fn()
const mockEnd = vi.fn()

vi.mock('pg', () => {
  const Client = vi.fn(() => ({
    connect: mockConnect,
    query: mockQuery,
    end: mockEnd,
  }))
  return { default: { Client } }
})

describe('EQLInstaller', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('checkPermissions', () => {
    it('returns ok when role is superuser', async () => {
      mockConnect.mockResolvedValue(undefined)
      mockQuery.mockResolvedValue({
        rows: [{ rolsuper: true, rolcreatedb: true }],
        rowCount: 1,
      })
      mockEnd.mockResolvedValue(undefined)

      const { EQLInstaller } = await import('@/installer/index.ts')
      const installer = new EQLInstaller({
        databaseUrl: 'postgresql://localhost:5432/test',
      })

      const result = await installer.checkPermissions()
      expect(result.ok).toBe(true)
      expect(result.missing).toEqual([])
    })

    it('returns missing permissions when role lacks privileges', async () => {
      mockConnect.mockResolvedValue(undefined)
      mockEnd.mockResolvedValue(undefined)

      let queryCall = 0
      mockQuery.mockImplementation(() => {
        queryCall++
        switch (queryCall) {
          // pg_roles query — not superuser
          case 1:
            return {
              rows: [{ rolsuper: false, rolcreatedb: false }],
              rowCount: 1,
            }
          // has_database_privilege — no CREATE
          case 2:
            return { rows: [{ has_create: false }], rowCount: 1 }
          // has_schema_privilege — no CREATE on public
          case 3:
            return { rows: [{ has_create: false }], rowCount: 1 }
          // pgcrypto check — not installed
          case 4:
            return { rows: [], rowCount: 0 }
          default:
            return { rows: [], rowCount: 0 }
        }
      })

      const { EQLInstaller } = await import('@/installer/index.ts')
      const installer = new EQLInstaller({
        databaseUrl: 'postgresql://localhost:5432/test',
      })

      const result = await installer.checkPermissions()
      expect(result.ok).toBe(false)
      expect(result.missing).toHaveLength(3)
    })
  })

  describe('isInstalled', () => {
    it('returns false when schema does not exist', async () => {
      mockConnect.mockResolvedValue(undefined)
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 })
      mockEnd.mockResolvedValue(undefined)

      const { EQLInstaller } = await import('@/installer/index.ts')
      const installer = new EQLInstaller({
        databaseUrl: 'postgresql://localhost:5432/test',
      })

      const result = await installer.isInstalled()
      expect(result).toBe(false)
    })

    it('returns true when schema exists', async () => {
      mockConnect.mockResolvedValue(undefined)
      mockQuery.mockResolvedValue({
        rows: [{ schema_name: 'eql_v2' }],
        rowCount: 1,
      })
      mockEnd.mockResolvedValue(undefined)

      const { EQLInstaller } = await import('@/installer/index.ts')
      const installer = new EQLInstaller({
        databaseUrl: 'postgresql://localhost:5432/test',
      })

      const result = await installer.isInstalled()
      expect(result).toBe(true)
    })
  })

  describe('install', () => {
    it('uses bundled SQL and executes in a transaction', async () => {
      mockConnect.mockResolvedValue(undefined)
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 })
      mockEnd.mockResolvedValue(undefined)

      const fetchSpy = vi.spyOn(globalThis, 'fetch')

      const { EQLInstaller } = await import('@/installer/index.ts')
      const installer = new EQLInstaller({
        databaseUrl: 'postgresql://localhost:5432/test',
      })

      await installer.install()

      // Should NOT call fetch — uses bundled SQL
      expect(fetchSpy).not.toHaveBeenCalled()
      expect(mockQuery).toHaveBeenCalledWith('BEGIN')
      // The second query should be the bundled SQL (a large string)
      const sqlCall = mockQuery.mock.calls.find(
        (call: string[]) =>
          typeof call[0] === 'string' &&
          call[0] !== 'BEGIN' &&
          call[0] !== 'COMMIT',
      )
      expect(sqlCall).toBeDefined()
      expect(sqlCall[0]).toContain('eql_v2')
      expect(mockQuery).toHaveBeenCalledWith('COMMIT')
    })

    it('fetches from GitHub when latest: true', async () => {
      const installSql = 'CREATE SCHEMA eql_v2;'

      mockConnect.mockResolvedValue(undefined)
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 })
      mockEnd.mockResolvedValue(undefined)

      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(new Response(installSql, { status: 200 }))

      const { EQLInstaller } = await import('@/installer/index.ts')
      const installer = new EQLInstaller({
        databaseUrl: 'postgresql://localhost:5432/test',
      })

      await installer.install({ latest: true })

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('cipherstash-encrypt.sql'),
      )
      expect(mockQuery).toHaveBeenCalledWith('BEGIN')
      expect(mockQuery).toHaveBeenCalledWith(installSql)
      expect(mockQuery).toHaveBeenCalledWith('COMMIT')
    })

    it('rolls back on SQL execution failure', async () => {
      mockConnect.mockResolvedValue(undefined)
      mockEnd.mockResolvedValue(undefined)

      mockQuery.mockImplementation((sql: string) => {
        // BEGIN succeeds, any SQL containing eql_v2 (the bundled install) fails
        if (sql !== 'BEGIN' && sql !== 'COMMIT' && sql !== 'ROLLBACK') {
          return Promise.reject(new Error('permission denied'))
        }
        return Promise.resolve({ rows: [], rowCount: 0 })
      })

      const { EQLInstaller } = await import('@/installer/index.ts')
      const installer = new EQLInstaller({
        databaseUrl: 'postgresql://localhost:5432/test',
      })

      await expect(installer.install()).rejects.toThrow('Failed to install EQL')
      expect(mockQuery).toHaveBeenCalledWith('ROLLBACK')
    })
  })
})
