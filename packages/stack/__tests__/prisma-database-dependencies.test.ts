import { ENCRYPTED_STORAGE_CODEC_ID } from '@/prisma/core/constants'
import {
  getCipherStashDatabaseDependencies,
  planEncryptedTypeOperations,
} from '@/prisma/core/database-dependencies'
import { describe, expect, it } from 'vitest'

/**
 * Phase 3 deliverables #5 (databaseDependencies.init) and #6
 * (planTypeOperations).
 *
 * - `getCipherStashDatabaseDependencies()` returns the EQL install
 *   bundle wrapped in a `ComponentDatabaseDependency` shape the
 *   migration planner can consume.
 * - `planEncryptedTypeOperations(input)` emits one
 *   `eql_v2.add_search_config(...)` operation per enabled
 *   searchable-encryption flag on a column's typeParams.
 */

describe('getCipherStashDatabaseDependencies', () => {
  it('returns a single dependency bundle with the EQL install operation', () => {
    const deps = getCipherStashDatabaseDependencies()
    expect(deps.init).toHaveLength(1)
    const bundle = deps.init?.[0]
    expect(bundle?.id).toBe('cipherstash.eql')
    expect(bundle?.install).toHaveLength(1)
  })

  it('emits an additive operation that runs the vendored EQL install bundle', () => {
    const op = getCipherStashDatabaseDependencies().init?.[0]?.install[0]
    expect(op?.operationClass).toBe('additive')
    expect(op?.target.id).toBe('postgres')
    // The execute step contains the bundle SQL; assert on a marker
    // string that's stable across EQL versions.
    expect(op?.execute[0]?.sql).toContain('eql_v2_configuration')
    expect(op?.execute[0]?.sql.length).toBeGreaterThan(1000)
  })

  it('skips the install on subsequent runs via a precheck on the eql_v2_configuration table', () => {
    const op = getCipherStashDatabaseDependencies().init?.[0]?.install[0]
    expect(op?.precheck[0]?.sql).toContain('eql_v2_configuration')
    expect(op?.postcheck[0]?.sql).toContain('eql_v2_configuration')
  })

  it('carries the EQL bundle version in the operation meta', () => {
    const op = getCipherStashDatabaseDependencies().init?.[0]?.install[0]
    expect(op?.meta?.eqlBundleVersion).toBeDefined()
  })
})

describe('planEncryptedTypeOperations', () => {
  function make(
    typeName: string,
    typeParams: Record<string, unknown>,
  ): Parameters<typeof planEncryptedTypeOperations>[0] {
    return {
      typeName,
      typeInstance: {
        codecId: ENCRYPTED_STORAGE_CODEC_ID,
        nativeType: '"public"."eql_v2_encrypted"',
        typeParams,
      },
    }
  }

  it('emits no operations when no search modes are enabled', () => {
    const result = planEncryptedTypeOperations(
      make('users__email', {
        dataType: 'string',
        equality: false,
        freeTextSearch: false,
        orderAndRange: false,
        searchableJson: false,
      }),
    )
    expect(result.operations).toHaveLength(0)
  })

  it('emits add_search_config for each enabled search mode', () => {
    const result = planEncryptedTypeOperations(
      make('users__email', {
        dataType: 'string',
        equality: true,
        freeTextSearch: true,
        orderAndRange: false,
        searchableJson: false,
      }),
    )
    expect(result.operations).toHaveLength(2)
    const indexNames = result.operations.map((op) => op.meta?.indexName)
    expect(indexNames).toEqual(['unique', 'match'])
  })

  it('uses the EQL cast_as mapping per dataType', () => {
    const cases: ReadonlyArray<{
      dataType: string
      castAs: string
    }> = [
      { dataType: 'string', castAs: 'text' },
      { dataType: 'number', castAs: 'double' },
      { dataType: 'boolean', castAs: 'boolean' },
      { dataType: 'date', castAs: 'date' },
      { dataType: 'json', castAs: 'jsonb' },
    ]
    for (const { dataType, castAs } of cases) {
      const result = planEncryptedTypeOperations(
        make('t__c', {
          dataType,
          equality: true,
          freeTextSearch: false,
          orderAndRange: false,
          searchableJson: false,
        }),
      )
      const sql = result.operations[0]?.execute[0]?.sql ?? ''
      expect(sql).toContain(`'${castAs}'`)
    }
  })

  it('produces SQL that calls eql_v2.add_search_config with the right table/column pair', () => {
    const result = planEncryptedTypeOperations(
      make('users__email', {
        dataType: 'string',
        equality: true,
        freeTextSearch: false,
        orderAndRange: false,
        searchableJson: false,
      }),
    )
    const sql = result.operations[0]?.execute[0]?.sql
    expect(sql).toContain(
      "eql_v2.add_search_config('users', 'email', 'unique', 'text')",
    )
  })

  it('emits one operation per searchable-encryption flag on json columns', () => {
    const result = planEncryptedTypeOperations(
      make('docs__profile', {
        dataType: 'json',
        equality: false,
        freeTextSearch: false,
        orderAndRange: false,
        searchableJson: true,
      }),
    )
    expect(result.operations).toHaveLength(1)
    expect(result.operations[0]?.meta?.indexName).toBe('ste_vec')
    expect(result.operations[0]?.execute[0]?.sql).toContain(
      "eql_v2.add_search_config('docs', 'profile', 'ste_vec', 'jsonb')",
    )
  })

  it('returns no operations when the typeParams shape is invalid', () => {
    const result = planEncryptedTypeOperations(
      make('users__email', {
        dataType: 'unknown-shape',
        equality: true,
      }),
    )
    expect(result.operations).toEqual([])
  })

  it('returns no operations when the typeName has no `__` separator (Phase 3 placeholder)', () => {
    const result = planEncryptedTypeOperations(
      make('cannot-derive', {
        dataType: 'string',
        equality: true,
        freeTextSearch: false,
        orderAndRange: false,
        searchableJson: false,
      }),
    )
    // Phase 3 documented limitation: without `(table, column)` from the
    // planner, we can't emit a sensible add_search_config call. Ship an
    // empty result rather than a malformed one.
    expect(result.operations).toEqual([])
  })

  it('emits a self-referential precheck so re-running the plan is idempotent', () => {
    const result = planEncryptedTypeOperations(
      make('users__email', {
        dataType: 'string',
        equality: true,
        freeTextSearch: false,
        orderAndRange: false,
        searchableJson: false,
      }),
    )
    const op = result.operations[0]
    // The precheck SQL inspects eql_v2_configuration to skip when the
    // index is already present; the postcheck inverts it.
    expect(op?.precheck[0]?.sql).toContain('eql_v2_configuration')
    expect(op?.precheck[0]?.sql).toContain("'unique'")
    expect(op?.postcheck[0]?.sql).toContain('eql_v2_configuration')
  })
})
