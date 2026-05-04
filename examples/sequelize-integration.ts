/**
 * Sequelize v6 + @cipherstash/stack — minimal integration sketch.
 *
 * NOT a packaged integration. A starting point you can hand to a customer
 * to drop into their app and adapt.
 *
 * What's here:
 *   1. registerEqlTypeParser(sequelize) — pg type parser for `eql_v2_encrypted`
 *      so SELECT returns a JS object instead of the raw composite-literal
 *      string `("{...}")`.
 *   2. defineEncryptedModel(...) — wires beforeCreate / beforeUpdate /
 *      beforeBulkCreate (encrypt) and afterFind (decrypt) hooks via
 *      bulkEncryptModels / bulkDecryptModels (one ZeroKMS call per batch),
 *      and patches the JSONB DataType for encrypted columns so the bound
 *      value carries a `::jsonb` cast (explained below).
 *   3. encryptedFinders(...) — eq / ilike / gte / lte / between helpers that
 *      pre-encrypt the search term and emit `eql_v2.<op>(col, $::eql_v2_encrypted)`
 *      SQL fragments for use with Sequelize's `where: literal(...)`.
 *
 * Why we use plain DataTypes.JSONB and not a custom DataType class
 * ----------------------------------------------------------------
 * Subclassing DataTypes.JSONB and passing the subclass into a model attribute
 * looks right, but Sequelize v6 normalises attribute types during `define()`
 * and instantiates a fresh DataTypes.JSONB — your subclass is dropped.
 * Properly registering a custom type requires monkey-patching the dialect's
 * data-types module, which is fragile across versions. So instead:
 *   - Declare encrypted columns as `DataTypes.JSONB` in Sequelize.
 *   - Take the encryption schema (encryptedTable(...)) explicitly so we know
 *     which columns to encrypt.
 *   - After define(), patch each encrypted column's DataType instance so its
 *     `_bindParam` / `_stringify` add a `::jsonb` cast. This forces the
 *     implicit ASSIGNMENT cast `jsonb -> eql_v2_encrypted` (defined by EQL
 *     via `eql_v2.to_encrypted(jsonb)` which does `ROW(data)::eql_v2_encrypted`)
 *     to fire — avoiding the "malformed record literal" error you get when
 *     Postgres tries to parse the JSON string as a composite literal directly.
 *
 * Database column type can be either:
 *   - `eql_v2_encrypted` — full EQL operator overrides on `=`, `<`, etc.
 *     Requires the type parser registration so reads come back as JS objects.
 *   - `JSONB` — simpler; reads come back as JS objects natively. Our query
 *     helpers use the explicit `eql_v2.<fn>(...)` calls so don't depend on
 *     the operator overloads. Pick this if you want to avoid the type parser.
 */

import { DataTypes, literal } from 'sequelize'
import type { Model, ModelAttributes, ModelStatic, Sequelize } from 'sequelize'
import pg from 'pg'

import { encryptedTable } from '@cipherstash/stack'
import type { EncryptionClient } from '@cipherstash/stack/encryption'

// ---------------------------------------------------------------------------
// 1. pg type parser for eql_v2_encrypted (only needed if the PG column type
//    is eql_v2_encrypted; skip if you store as JSONB).
// ---------------------------------------------------------------------------

export async function registerEqlTypeParser(sequelize: Sequelize): Promise<void> {
  const [rows] = await sequelize.query(
    `SELECT oid::int AS oid FROM pg_type WHERE typname = 'eql_v2_encrypted' LIMIT 1`,
  )
  const row = (rows as Array<{ oid: number }>)[0]
  if (!row) {
    throw new Error('eql_v2_encrypted type not found — install EQL first')
  }
  pg.types.setTypeParser(row.oid, (raw: string) => {
    if (raw == null) return null
    if (!raw.startsWith('(') || !raw.endsWith(')')) return JSON.parse(raw)
    let inner = raw.slice(1, -1)
    if (inner.startsWith('"') && inner.endsWith('"')) {
      inner = inner.slice(1, -1).replace(/""/g, '"').replace(/\\\\/g, '\\')
    }
    return JSON.parse(inner)
  })
}

// Convenience helper — encrypted columns are just JSONB to Sequelize.
export const encryptedAttribute = (opts: { allowNull?: boolean } = {}) => ({
  type: DataTypes.JSONB,
  allowNull: opts.allowNull ?? true,
})

// ---------------------------------------------------------------------------
// 2. defineEncryptedModel — wires hooks
// ---------------------------------------------------------------------------

export interface EncryptedModelHandle<M extends Model> {
  model: ModelStatic<M>
  schema: ReturnType<typeof encryptedTable>
  encryptedColumns: string[]
}

export interface DefineEncryptedOpts {
  client: EncryptionClient
  // biome-ignore lint/suspicious/noExplicitAny: schema is opaque
  schema: any
  tableName?: string
  timestamps?: boolean
}

export function defineEncryptedModel<M extends Model = Model>(
  sequelize: Sequelize,
  modelName: string,
  attributes: ModelAttributes,
  { client, schema, tableName, timestamps = false }: DefineEncryptedOpts,
): EncryptedModelHandle<M> {
  const encryptedColumns = Object.keys(schema.columnBuilders ?? {})

  const Mdl = sequelize.define(modelName, attributes, {
    tableName,
    timestamps,
  }) as ModelStatic<M>

  // Patch JSONB DataType instances on encrypted columns so the bound value
  // carries a ::jsonb cast — see top-of-file comment for why.
  for (const c of encryptedColumns) {
    // biome-ignore lint/suspicious/noExplicitAny: rawAttributes typing
    const attr = (Mdl.rawAttributes as any)[c]
    if (!attr?.type) continue
    const t = attr.type
    t.escape = false
    t._stringify = (value: unknown) => {
      if (value == null) return 'NULL'
      const json = JSON.stringify(value).replace(/'/g, "''")
      return `'${json}'::jsonb`
    }
    t._bindParam = (value: unknown, opts: { bindParam: (v: unknown) => string }) => {
      if (value == null) return 'NULL'
      return `${opts.bindParam(JSON.stringify(value))}::jsonb`
    }
  }

  // Snapshot plaintext per-call so we can restore it after the write completes,
  // otherwise the user's instance ends up holding the EQL payload.
  const snapshots = new WeakMap<object, Map<unknown, Record<string, unknown>>>()
  const snap = (opts: object): Map<unknown, Record<string, unknown>> => {
    let m = snapshots.get(opts)
    if (!m) { m = new Map(); snapshots.set(opts, m) }
    return m
  }

  // biome-ignore lint/suspicious/noExplicitAny: instance is dynamic
  const getVal = (inst: any, c: string) =>
    typeof inst.getDataValue === 'function' ? inst.getDataValue(c) : inst[c]
  // biome-ignore lint/suspicious/noExplicitAny: instance is dynamic
  const setVal = (inst: any, c: string, v: unknown) => {
    if (typeof inst.setDataValue === 'function') inst.setDataValue(c, v)
    else inst[c] = v
  }

  // Distinguish plaintext from already-encrypted EQL JSON (idempotent in case
  // both beforeSave and beforeCreate fire on the same write).
  const isEqlPayload = (v: unknown): boolean =>
    typeof v === 'object' && v !== null && 'c' in (v as object) && 'i' in (v as object)

  // biome-ignore lint/suspicious/noExplicitAny: instance is dynamic
  const collectPlaintexts = (inst: any) => {
    const out: Record<string, unknown> = {}
    for (const c of encryptedColumns) {
      const v = getVal(inst, c)
      if (v != null && !isEqlPayload(v)) out[c] = v
    }
    return out
  }

  // biome-ignore lint/suspicious/noExplicitAny: instance is dynamic
  const restore = (inst: any, plain: Record<string, unknown>) => {
    for (const [k, v] of Object.entries(plain)) setVal(inst, k, v)
  }

  // ---- single-row writes ----
  // biome-ignore lint/suspicious/noExplicitAny: hook signature
  const beforeWrite = async (inst: any, opts: any) => {
    const plain = collectPlaintexts(inst)
    if (Object.keys(plain).length === 0) return
    const r = await client.encryptModel(plain, schema)
    if (r.failure) throw new Error(`encrypt failed: ${r.failure.message}`)
    snap(opts).set(inst, plain)
    for (const [k, v] of Object.entries(r.data)) setVal(inst, k, v)
  }

  // biome-ignore lint/suspicious/noExplicitAny: hook signature
  const afterWrite = (inst: any, opts: any) => {
    const m = snap(opts)
    const plain = m.get(inst)
    if (plain) { restore(inst, plain); m.delete(inst) }
  }

  Mdl.addHook('beforeCreate', beforeWrite)
  Mdl.addHook('beforeUpdate', beforeWrite)
  Mdl.addHook('afterCreate', afterWrite)
  Mdl.addHook('afterUpdate', afterWrite)

  // ---- bulk create — one bulkEncryptModels call regardless of batch size ----
  // biome-ignore lint/suspicious/noExplicitAny: hook signature
  Mdl.addHook('beforeBulkCreate', async (instances: any[], opts: any) => {
    if (instances.length === 0) return
    const plains = instances.map(collectPlaintexts)
    const r = await client.bulkEncryptModels(plains, schema)
    if (r.failure) throw new Error(`bulk encrypt failed: ${r.failure.message}`)
    const m = snap(opts)
    instances.forEach((inst, i) => {
      m.set(inst, plains[i])
      for (const [k, v] of Object.entries(r.data[i] as Record<string, unknown>)) setVal(inst, k, v)
    })
  })
  // biome-ignore lint/suspicious/noExplicitAny: hook signature
  Mdl.addHook('afterBulkCreate', (instances: any[], opts: any) => {
    const m = snap(opts)
    for (const inst of instances) {
      const plain = m.get(inst)
      if (plain) { restore(inst, plain); m.delete(inst) }
    }
  })

  // ---- decrypt after find ----
  Mdl.addHook('afterFind', async (result: unknown) => {
    if (!result) return
    // biome-ignore lint/suspicious/noExplicitAny: result shape varies
    const list: any[] = Array.isArray(result) ? result : [result]
    if (list.length === 0) return

    const payloads: Array<{ id: string; data: unknown }> = []
    list.forEach((inst, i) => {
      for (const c of encryptedColumns) {
        const v = getVal(inst, c)
        if (v != null) payloads.push({ id: `${i}:${c}`, data: v })
      }
    })
    if (payloads.length === 0) return

    // biome-ignore lint/suspicious/noExplicitAny: payload cast
    const r = await client.bulkDecrypt(payloads as any)
    if (r.failure) throw new Error(`decrypt failed: ${r.failure.message}`)

    for (const item of r.data) {
      if (!('data' in item)) continue
      const sep = item.id.indexOf(':')
      const idx = Number(item.id.slice(0, sep))
      const col = item.id.slice(sep + 1)
      setVal(list[idx], col, item.data)
    }
  })

  return { model: Mdl, schema, encryptedColumns }
}

// ---------------------------------------------------------------------------
// 3. encryptedFinders — query-side helpers
// ---------------------------------------------------------------------------
// Sequelize's `Op.eq`/`Op.like`/etc. won't auto-encrypt the right-hand side,
// so we encrypt the search term and emit a literal SQL fragment of the form:
//   eql_v2.<op>("<col>", '<eql json>'::jsonb::eql_v2_encrypted)
// Combine with `where: literal((q.and(...) as any).val)` or just `where: lit`.

type Lit = ReturnType<typeof literal>

const sqlIdent = (s: string) => `"${s.replace(/"/g, '""')}"`
const sqlString = (s: string) => `'${s.replace(/'/g, "''")}'`

function eqlFragment(op: string, columnName: string, payload: unknown): Lit {
  return literal(
    `eql_v2.${op}(${sqlIdent(columnName)}, ${sqlString(JSON.stringify(payload))}::jsonb::eql_v2_encrypted)`,
  )
}

export interface EncryptedFinders {
  eq: (col: string, value: unknown) => Promise<Lit>
  gt: (col: string, value: unknown) => Promise<Lit>
  gte: (col: string, value: unknown) => Promise<Lit>
  lt: (col: string, value: unknown) => Promise<Lit>
  lte: (col: string, value: unknown) => Promise<Lit>
  like: (col: string, pattern: string) => Promise<Lit>
  ilike: (col: string, pattern: string) => Promise<Lit>
  between: (col: string, min: unknown, max: unknown) => Promise<Lit>
  and: (...frags: Lit[]) => Lit
  or: (...frags: Lit[]) => Lit
}

export function encryptedFinders<M extends Model>(
  client: EncryptionClient,
  { schema }: EncryptedModelHandle<M>,
): EncryptedFinders {
  // biome-ignore lint/suspicious/noExplicitAny: schema is opaque
  const lookup = (col: string): { column: any; table: any } => {
    // biome-ignore lint/suspicious/noExplicitAny: schema is opaque
    const table = schema as any
    const column = table.columnBuilders?.[col] ?? table[col]
    if (!column) throw new Error(`Column '${col}' is not encrypted`)
    return { column, table }
  }

  const make = (op: string, queryType: 'equality' | 'orderAndRange' | 'freeTextSearch') =>
    async (col: string, value: unknown): Promise<Lit> => {
      const { column, table } = lookup(col)
      // biome-ignore lint/suspicious/noExplicitAny: encryptQuery generic
      const r = await client.encryptQuery(value as any, { column, table, queryType })
      if (r.failure) throw new Error(r.failure.message)
      return eqlFragment(op, col, r.data)
    }

  const combineSql = (sep: ' AND ' | ' OR ', frags: Lit[]): Lit => {
    if (frags.length === 0) return literal(sep === ' AND ' ? 'TRUE' : 'FALSE')
    // biome-ignore lint/suspicious/noExplicitAny: Literal's val is internal
    const parts = frags.map(f => `(${(f as any).val})`)
    return literal(parts.join(sep))
  }

  return {
    eq: make('eq', 'equality'),
    gt: make('gt', 'orderAndRange'),
    gte: make('gte', 'orderAndRange'),
    lt: make('lt', 'orderAndRange'),
    lte: make('lte', 'orderAndRange'),
    like: make('like', 'freeTextSearch'),
    ilike: make('ilike', 'freeTextSearch'),
    between: async (col, min, max) => {
      const { column, table } = lookup(col)
      // biome-ignore lint/suspicious/noExplicitAny: encryptQuery generic
      const minR = await client.encryptQuery(min as any, { column, table, queryType: 'orderAndRange' })
      // biome-ignore lint/suspicious/noExplicitAny: encryptQuery generic
      const maxR = await client.encryptQuery(max as any, { column, table, queryType: 'orderAndRange' })
      if (minR.failure) throw new Error(minR.failure.message)
      if (maxR.failure) throw new Error(maxR.failure.message)
      return literal(
        `(eql_v2.gte(${sqlIdent(col)}, ${sqlString(JSON.stringify(minR.data))}::jsonb::eql_v2_encrypted) ` +
        `AND eql_v2.lte(${sqlIdent(col)}, ${sqlString(JSON.stringify(maxR.data))}::jsonb::eql_v2_encrypted))`,
      )
    },
    and: (...frags) => combineSql(' AND ', frags),
    or: (...frags) => combineSql(' OR ', frags),
  }
}
