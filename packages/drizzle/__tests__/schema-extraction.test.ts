import { integer, pgTable, text } from 'drizzle-orm/pg-core'
import { describe, expect, it } from 'vitest'
import { encryptedType, extractProtectSchema } from '../src/pg'

// ============================================================================
// 3a. Basic extraction
// ============================================================================

describe('extractProtectSchema basic extraction', () => {
  it('extracts a single encrypted column', () => {
    const table = pgTable('single_col', {
      email: encryptedType<string>('email', {
        equality: true,
      }),
    })

    const protectTable = extractProtectSchema(table)
    const built = protectTable.build()

    expect(built.tableName).toBe('single_col')
    expect(built.columns).toHaveProperty('email')
    expect(Object.keys(built.columns)).toHaveLength(1)
  })

  it('extracts multiple encrypted columns with different configs', () => {
    const table = pgTable('multi_col', {
      email: encryptedType<string>('email', {
        equality: true,
        freeTextSearch: true,
      }),
      age: encryptedType<number>('age', {
        dataType: 'number',
        orderAndRange: true,
      }),
      metadata: encryptedType<Record<string, unknown>>('metadata', {
        dataType: 'json',
        searchableJson: true,
      }),
    })

    const protectTable = extractProtectSchema(table)
    const built = protectTable.build()

    expect(built.tableName).toBe('multi_col')
    expect(Object.keys(built.columns)).toHaveLength(3)
    expect(built.columns).toHaveProperty('email')
    expect(built.columns).toHaveProperty('age')
    expect(built.columns).toHaveProperty('metadata')
  })
})

// ============================================================================
// 3b. Config option mapping
// ============================================================================

describe('extractProtectSchema config mapping', () => {
  it('equality: true -> column has unique index in build output', () => {
    const table = pgTable('eq_test', {
      col: encryptedType<string>('col', { equality: true }),
    })

    const built = extractProtectSchema(table).build()
    expect(built.columns.col.indexes).toHaveProperty('unique')
  })

  it('orderAndRange: true -> column has ore index in build output', () => {
    const table = pgTable('ore_test', {
      col: encryptedType<string>('col', { orderAndRange: true }),
    })

    const built = extractProtectSchema(table).build()
    expect(built.columns.col.indexes).toHaveProperty('ore')
  })

  it('freeTextSearch: true -> column has match index in build output', () => {
    const table = pgTable('match_test', {
      col: encryptedType<string>('col', { freeTextSearch: true }),
    })

    const built = extractProtectSchema(table).build()
    expect(built.columns.col.indexes).toHaveProperty('match')
  })

  it('searchableJson: true -> column has ste_vec index in build output', () => {
    const table = pgTable('ste_vec_test', {
      col: encryptedType<Record<string, unknown>>('col', {
        dataType: 'json',
        searchableJson: true,
      }),
    })

    const built = extractProtectSchema(table).build()
    expect(built.columns.col.indexes).toHaveProperty('ste_vec')
    // ste_vec prefix is automatically set to tableName/columnName
    expect(built.columns.col.indexes.ste_vec?.prefix).toBe('ste_vec_test/col')
  })

  it('dataType: "json" -> column has cast_as "json"', () => {
    const table = pgTable('json_cast_test', {
      col: encryptedType<Record<string, unknown>>('col', {
        dataType: 'json',
        searchableJson: true,
      }),
    })

    const built = extractProtectSchema(table).build()
    expect(built.columns.col.cast_as).toBe('json')
  })

  it('dataType: "number" -> column has appropriate cast_as', () => {
    const table = pgTable('number_cast_test', {
      col: encryptedType<number>('col', {
        dataType: 'number',
        orderAndRange: true,
      }),
    })

    const built = extractProtectSchema(table).build()
    expect(built.columns.col.cast_as).toBe('number')
  })

  it('default dataType is string', () => {
    const table = pgTable('default_cast_test', {
      col: encryptedType<string>('col', { equality: true }),
    })

    const built = extractProtectSchema(table).build()
    expect(built.columns.col.cast_as).toBe('string')
  })

  it('combined configs: equality + orderAndRange + freeTextSearch', () => {
    const table = pgTable('combined_test', {
      col: encryptedType<string>('col', {
        equality: true,
        orderAndRange: true,
        freeTextSearch: true,
      }),
    })

    const built = extractProtectSchema(table).build()
    const indexes = built.columns.col.indexes

    expect(indexes).toHaveProperty('unique')
    expect(indexes).toHaveProperty('ore')
    expect(indexes).toHaveProperty('match')
  })

  it('combined configs: equality + searchableJson', () => {
    const table = pgTable('combined_json_test', {
      col: encryptedType<Record<string, unknown>>('col', {
        dataType: 'json',
        equality: true,
        searchableJson: true,
      }),
    })

    const built = extractProtectSchema(table).build()
    const indexes = built.columns.col.indexes

    expect(indexes).toHaveProperty('unique')
    expect(indexes).toHaveProperty('ste_vec')
  })
})

// ============================================================================
// 3c. Edge cases
// ============================================================================

describe('extractProtectSchema edge cases', () => {
  it('throws when table has zero encrypted columns', () => {
    const table = pgTable('no_encrypted', {
      title: text('title'),
      count: integer('count'),
    })

    expect(() => extractProtectSchema(table)).toThrow(
      /No encrypted columns found/,
    )
  })

  it('mixed encrypted and regular columns -> only encrypted columns extracted', () => {
    const table = pgTable('mixed_cols', {
      id: integer('id').primaryKey(),
      email: encryptedType<string>('email', { equality: true }),
      name: text('name'),
      age: encryptedType<number>('age', {
        dataType: 'number',
        orderAndRange: true,
      }),
      description: text('description'),
    })

    const built = extractProtectSchema(table).build()

    // Only encrypted columns should be in the output
    expect(Object.keys(built.columns)).toHaveLength(2)
    expect(built.columns).toHaveProperty('email')
    expect(built.columns).toHaveProperty('age')
    expect(built.columns).not.toHaveProperty('id')
    expect(built.columns).not.toHaveProperty('name')
    expect(built.columns).not.toHaveProperty('description')
  })

  it('uses the SQL column name (not property key) for the column', () => {
    // When the property key in pgTable differs from the column name
    // The encryptedType name parameter is the actual SQL column name
    const table = pgTable('name_test', {
      userEmail: encryptedType<string>('user_email', { equality: true }),
    })

    const built = extractProtectSchema(table).build()

    // The column name in the build output should be the SQL column name
    expect(built.columns).toHaveProperty('user_email')
  })

  it('table name matches the pgTable name', () => {
    const table = pgTable('my_custom_table', {
      col: encryptedType<string>('col', { equality: true }),
    })

    const built = extractProtectSchema(table).build()
    expect(built.tableName).toBe('my_custom_table')
  })

  it('equality with custom token filters is passed through', () => {
    const table = pgTable('token_filter_test', {
      col: encryptedType<string>('col', {
        equality: [{ kind: 'downcase' }],
      }),
    })

    const built = extractProtectSchema(table).build()
    expect(built.columns.col.indexes).toHaveProperty('unique')
    expect(built.columns.col.indexes.unique?.token_filters).toEqual([
      { kind: 'downcase' },
    ])
  })

  it('freeTextSearch with custom MatchIndexOpts is passed through', () => {
    const table = pgTable('match_opts_test', {
      col: encryptedType<string>('col', {
        freeTextSearch: {
          tokenizer: { kind: 'ngram', token_length: 3 },
          k: 6,
          m: 2048,
          include_original: true,
          token_filters: [{ kind: 'downcase' }],
        },
      }),
    })

    const built = extractProtectSchema(table).build()
    expect(built.columns.col.indexes).toHaveProperty('match')
    expect(built.columns.col.indexes.match?.tokenizer).toEqual({
      kind: 'ngram',
      token_length: 3,
    })
  })
})
