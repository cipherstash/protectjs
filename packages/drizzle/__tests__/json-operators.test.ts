import { describe, expect, it } from 'vitest'
import { pgTable } from 'drizzle-orm/pg-core'
import { encryptedType, getEncryptedColumnConfig, extractProtectSchema } from '../src/pg'
import { normalizePath, JsonPathBuilder, isLazyJsonOperator, type LazyJsonOperator } from '../src/pg/json-operators'

describe('searchableJson column config', () => {
  it('should store searchableJson config on encrypted column', () => {
    const testTable = pgTable('test', {
      metadata: encryptedType<{ user: { email: string } }>('metadata', {
        dataType: 'json',
        searchableJson: true,
      }),
    })

    const config = getEncryptedColumnConfig('metadata', testTable.metadata)
    expect(config).toBeDefined()
    expect(config?.searchableJson).toBe(true)
    expect(config?.dataType).toBe('json')
  })

  it('should default searchableJson to undefined when not specified', () => {
    const testTable = pgTable('test', {
      profile: encryptedType<{ name: string }>('profile', {
        dataType: 'json',
      }),
    })

    const config = getEncryptedColumnConfig('profile', testTable.profile)
    expect(config).toBeDefined()
    expect(config?.searchableJson).toBeUndefined()
  })
})

describe('schema extraction with searchableJson', () => {
  it('should extract searchableJson config to ProtectColumn', () => {
    const testTable = pgTable('test_json', {
      metadata: encryptedType<{ user: { email: string } }>('metadata', {
        dataType: 'json',
        searchableJson: true,
      }),
    })

    const protectSchema = extractProtectSchema(testTable)
    const builtSchema = protectSchema.build()

    // The column should have ste_vec index configured
    expect(builtSchema.columns.metadata).toBeDefined()
    const columnConfig = builtSchema.columns.metadata
    expect(columnConfig.indexes.ste_vec).toBeDefined()
  })

  it('should not add ste_vec index when searchableJson is not set', () => {
    const testTable = pgTable('test_json_no_search', {
      profile: encryptedType<{ name: string }>('profile', {
        dataType: 'json',
      }),
    })

    const protectSchema = extractProtectSchema(testTable)
    const builtSchema = protectSchema.build()

    expect(builtSchema.columns.profile).toBeDefined()
    const columnConfig = builtSchema.columns.profile
    expect(columnConfig.indexes.ste_vec).toBeUndefined()
  })
})

describe('normalizePath', () => {
  it('should strip $. prefix from JSONPath format', () => {
    expect(normalizePath('$.user.email')).toBe('user.email')
  })

  it('should handle root path $', () => {
    expect(normalizePath('$')).toBe('')
  })

  it('should pass through dot notation unchanged', () => {
    expect(normalizePath('user.email')).toBe('user.email')
  })

  it('should handle array index notation', () => {
    expect(normalizePath('$.items[0].name')).toBe('items[0].name')
  })

  it('should handle empty string', () => {
    expect(normalizePath('')).toBe('')
  })
})

describe('JsonPathBuilder', () => {
  const testTable = pgTable('test_builder', {
    metadata: encryptedType<{ user: { email: string } }>('metadata', {
      dataType: 'json',
      searchableJson: true,
    }),
  })

  it('should be instantiable with column and path', () => {
    const builder = new JsonPathBuilder(
      testTable.metadata,
      'user.email',
      { columnName: 'metadata', config: { searchableJson: true } } as any,
      {} as any, // protectClient mock
    )

    expect(builder).toBeDefined()
    expect(builder.getPath()).toBe('user.email')
  })
})

describe('LazyJsonOperator', () => {
  it('should identify lazy JSON operators with value encryption', () => {
    const lazyOp: LazyJsonOperator = {
      __isLazyOperator: true,
      __isJsonOperator: true,
      operator: 'json_eq',
      path: 'user.email',
      value: 'test@example.com',
      encryptionType: 'value',
      columnInfo: {} as any,
      execute: () => ({} as any),
    }

    expect(isLazyJsonOperator(lazyOp)).toBe(true)
  })

  it('should identify lazy JSON operators with selector encryption', () => {
    const lazyOp: LazyJsonOperator = {
      __isLazyOperator: true,
      __isJsonOperator: true,
      operator: 'json_array_length_gt',
      path: 'items',
      comparisonValue: 5,
      encryptionType: 'selector',
      columnInfo: {} as any,
      execute: () => ({} as any),
    }

    expect(isLazyJsonOperator(lazyOp)).toBe(true)
  })

  it('should identify lazy JSON operators with no encryption', () => {
    const lazyOp: LazyJsonOperator = {
      __isLazyOperator: true,
      __isJsonOperator: true,
      operator: 'json_array_length_gt',
      path: '',  // root path
      comparisonValue: 5,
      encryptionType: 'none',
      columnInfo: {} as any,
      execute: () => ({} as any),
    }

    expect(isLazyJsonOperator(lazyOp)).toBe(true)
  })

  it('should return false for regular lazy operators', () => {
    // Note: This tests that isLazyJsonOperator correctly distinguishes JSON operators
    // from regular lazy operators. The `needsEncryption` field is used by regular
    // lazy operators (in operators.ts), NOT by JSON operators.
    // JSON operators use `encryptionType: 'value' | 'selector' | 'none'` instead.
    const regularLazyOp = {
      __isLazyOperator: true,
      operator: 'eq',
      left: {},
      right: 'value',
      needsEncryption: true,  // Regular lazy operator field - NOT used for JSON operators
      columnInfo: {},
      execute: () => ({}),
    }

    expect(isLazyJsonOperator(regularLazyOp)).toBe(false)
  })

  it('should return false for non-objects', () => {
    expect(isLazyJsonOperator(null)).toBe(false)
    expect(isLazyJsonOperator(undefined)).toBe(false)
    expect(isLazyJsonOperator('string')).toBe(false)
  })
})

describe('JsonPathBuilder value methods', () => {
  const rootBuilder = new JsonPathBuilder(
    { name: 'metadata' } as any,
    '',  // root path
    { columnName: 'metadata', config: { searchableJson: true } } as any,
    {} as any,
  )

  const nestedBuilder = new JsonPathBuilder(
    { name: 'metadata' } as any,
    'items',  // nested path
    { columnName: 'metadata', config: { searchableJson: true } } as any,
    {} as any,
  )

  it('get() should return Promise resolving to SQL expression', async () => {
    // Note: Full test requires mock protectClient for selector encryption
    // This tests the root path case which doesn't need encryption
    const sqlExpr = await rootBuilder.get()
    expect(sqlExpr).toBeDefined()
    expect(typeof sqlExpr.getSQL).toBe('function')
  })

  it('getSync() on root should return SQL expression', () => {
    const sqlExpr = rootBuilder.getSync()
    expect(sqlExpr).toBeDefined()
    expect(typeof sqlExpr.getSQL).toBe('function')
  })

  it('getSync() on non-root without selector should throw', () => {
    expect(() => nestedBuilder.getSync()).toThrow(/selector/)
  })

  it('getSync() on non-root with selector should return SQL expression', () => {
    const selector = 'pre_encrypted_selector_hash'
    const sqlExpr = nestedBuilder.getSync(selector)
    expect(sqlExpr).toBeDefined()
    expect(typeof sqlExpr.getSQL).toBe('function')
  })

  it('arrayLength() should return a new JsonPathBuilder in array-length mode', () => {
    const lengthBuilder = nestedBuilder.arrayLength()
    expect(lengthBuilder).toBeInstanceOf(JsonPathBuilder)
  })

  it('arrayLength().gt() on non-root path should use selector encryption', () => {
    const lazyOp = nestedBuilder.arrayLength().gt(5)
    expect(lazyOp.operator).toBe('json_array_length_gt')
    expect(lazyOp.comparisonValue).toBe(5)
    expect(lazyOp.encryptionType).toBe('selector')  // Non-root needs selector
  })

  it('arrayLength().gt() on root path should use no encryption', () => {
    const lazyOp = rootBuilder.arrayLength().gt(5)
    expect(lazyOp.operator).toBe('json_array_length_gt')
    expect(lazyOp.comparisonValue).toBe(5)
    expect(lazyOp.encryptionType).toBe('none')  // Root needs no encryption
  })
})

describe('JsonPathBuilder.eq()', () => {
  it('should return a lazy JSON operator with value encryption', () => {
    const builder = new JsonPathBuilder(
      {} as any, // column mock
      'user.email',
      { columnName: 'metadata', config: { searchableJson: true } } as any,
      {} as any, // protectClient mock
    )

    const lazyOp = builder.eq('test@example.com')

    expect(isLazyJsonOperator(lazyOp)).toBe(true)
    expect(lazyOp.operator).toBe('json_eq')
    expect(lazyOp.path).toBe('user.email')
    expect(lazyOp.value).toBe('test@example.com')
    expect(lazyOp.encryptionType).toBe('value')
  })
})

describe('JsonPathBuilder comparison methods', () => {
  const builder = new JsonPathBuilder(
    {} as any,
    'user.role',
    { columnName: 'metadata', config: { searchableJson: true } } as any,
    {} as any,
  )

  it('ne() should return json_ne operator', () => {
    const lazyOp = builder.ne('admin')
    expect(lazyOp.operator).toBe('json_ne')
  })

  it('contains() should return json_contains operator', () => {
    const lazyOp = builder.contains({ role: 'admin' })
    expect(lazyOp.operator).toBe('json_contains')
  })

  it('containedBy() should return json_contained_by operator', () => {
    const lazyOp = builder.containedBy({ permissions: ['read', 'write'] })
    expect(lazyOp.operator).toBe('json_contained_by')
  })
})

describe('JsonPathBuilder path query methods', () => {
  const builder = new JsonPathBuilder(
    { name: 'metadata' } as any,
    'items',  // dot-notation path
    { columnName: 'metadata', config: { searchableJson: true } } as any,
    {} as any,
  )

  const rootBuilder = new JsonPathBuilder(
    { name: 'metadata' } as any,
    '',  // root path
    { columnName: 'metadata', config: { searchableJson: true } } as any,
    {} as any,
  )

  it('pathExtract() should return SQL with encrypted selector for non-root', async () => {
    // pathExtract() encrypts the current path to get a selector
    // Then uses eql_v2.jsonb_path_query(column, selector)
    const sqlExpr = await builder.pathExtract()
    expect(sqlExpr).toBeDefined()
    expect(typeof sqlExpr.getSQL).toBe('function')
  })

  it('pathExtractFirst() should return SQL with encrypted selector for non-root', async () => {
    const sqlExpr = await builder.pathExtractFirst()
    expect(sqlExpr).toBeDefined()
    expect(typeof sqlExpr.getSQL).toBe('function')
  })

  it('pathExtract() on root should throw (SRF not applicable to root)', async () => {
    await expect(rootBuilder.pathExtract()).rejects.toThrow(/root path/)
  })

  it('pathExtractFirst() on root should return column directly', async () => {
    const sqlExpr = await rootBuilder.pathExtractFirst()
    expect(sqlExpr).toBeDefined()
  })

  it('pathExtractWithSelector() should accept pre-encrypted selector', () => {
    // For advanced users who already have an encrypted selector
    const selector = 'pre_encrypted_selector_hash'
    const sqlExpr = builder.pathExtractWithSelector(selector)
    expect(sqlExpr).toBeDefined()
    expect(typeof sqlExpr.getSQL).toBe('function')
  })
})

describe('createProtectOperators.jsonPath()', () => {
  it('should return JsonPathBuilder for searchableJson column', async () => {
    const testTable = pgTable('json_test', {
      metadata: encryptedType<{ user: { email: string } }>('metadata', {
        dataType: 'json',
        searchableJson: true,
      }),
    })

    const schema = extractProtectSchema(testTable)
    const { createProtectOperators } = await import('../src/pg/operators.js')
    const { protect } = await import('@cipherstash/protect')

    const protectClient = await protect({ schemas: [schema] })
    const ops = createProtectOperators(protectClient)

    const builder = ops.jsonPath(testTable.metadata, '$.user.email')
    expect(builder).toBeInstanceOf(JsonPathBuilder)
    expect(builder.getPath()).toBe('user.email')
  })

  it('should throw error for column without searchableJson', async () => {
    const testTable = pgTable('json_test_no_search', {
      profile: encryptedType<{ name: string }>('profile', {
        dataType: 'json',
      }),
    })

    const schema = extractProtectSchema(testTable)
    const { createProtectOperators } = await import('../src/pg/operators.js')
    const { protect } = await import('@cipherstash/protect')

    const protectClient = await protect({ schemas: [schema] })
    const ops = createProtectOperators(protectClient)

    expect(() => ops.jsonPath(testTable.profile, '$.name')).toThrow(
      /searchableJson.*required/i
    )
  })

  it('should throw error for searchableJson without dataType json', async () => {
    const testTable = pgTable('json_test_wrong_type', {
      // Invalid config: searchableJson requires dataType: 'json'
      data: encryptedType<string>('data', {
        searchableJson: true,
        // Missing dataType: 'json'
      }),
    })

    const schema = extractProtectSchema(testTable)
    const { createProtectOperators } = await import('../src/pg/operators.js')
    const { protect } = await import('@cipherstash/protect')

    const protectClient = await protect({ schemas: [schema] })
    const ops = createProtectOperators(protectClient)

    expect(() => ops.jsonPath(testTable.data, '$.path')).toThrow(
      /searchableJson.*dataType.*json/i
    )
  })
})
