import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { rewriteEncryptedAlterColumns } from '../commands/db/rewrite-migrations.js'

describe('rewriteEncryptedAlterColumns', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stash-rewrite-'))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('rewrites an in-place ALTER COLUMN with the bare type name', async () => {
    const original = `ALTER TABLE "transactions" ALTER COLUMN "amount" SET DATA TYPE eql_v2_encrypted;\n`
    const filePath = path.join(tmpDir, '0002_alter.sql')
    fs.writeFileSync(filePath, original)

    const rewritten = await rewriteEncryptedAlterColumns(tmpDir)

    expect(rewritten).toEqual([filePath])
    const updated = fs.readFileSync(filePath, 'utf-8')
    expect(updated).toContain(
      'ALTER TABLE "transactions" ADD COLUMN "amount__cipherstash_tmp" "public"."eql_v2_encrypted";',
    )
    expect(updated).toContain(
      'ALTER TABLE "transactions" DROP COLUMN "amount";',
    )
    expect(updated).toContain(
      'ALTER TABLE "transactions" RENAME COLUMN "amount__cipherstash_tmp" TO "amount";',
    )
    expect(updated).not.toContain('SET DATA TYPE')
  })

  it('rewrites the schema-qualified form produced by drizzle-kit', async () => {
    const original =
      'ALTER TABLE "users" ALTER COLUMN "email" SET DATA TYPE "public"."eql_v2_encrypted";\n'
    const filePath = path.join(tmpDir, '0003_alter.sql')
    fs.writeFileSync(filePath, original)

    await rewriteEncryptedAlterColumns(tmpDir)

    const updated = fs.readFileSync(filePath, 'utf-8')
    expect(updated).toContain(
      'ALTER TABLE "users" ADD COLUMN "email__cipherstash_tmp" "public"."eql_v2_encrypted";',
    )
    expect(updated).not.toContain('SET DATA TYPE')
  })

  it('leaves unrelated migrations untouched', async () => {
    const original =
      'CREATE TABLE "widgets" ("id" integer PRIMARY KEY, "name" text);\n'
    const filePath = path.join(tmpDir, '0001_init.sql')
    fs.writeFileSync(filePath, original)

    const rewritten = await rewriteEncryptedAlterColumns(tmpDir)

    expect(rewritten).toEqual([])
    expect(fs.readFileSync(filePath, 'utf-8')).toBe(original)
  })

  it('skips the file passed in options.skip', async () => {
    const install = path.join(tmpDir, '0000_install-eql.sql')
    const alter = path.join(tmpDir, '0002_alter.sql')
    fs.writeFileSync(install, 'CREATE SCHEMA eql_v2;\n')
    fs.writeFileSync(
      alter,
      'ALTER TABLE "t" ALTER COLUMN "c" SET DATA TYPE eql_v2_encrypted;',
    )

    const rewritten = await rewriteEncryptedAlterColumns(tmpDir, {
      skip: install,
    })
    expect(rewritten).toEqual([alter])
    expect(fs.readFileSync(install, 'utf-8')).toBe('CREATE SCHEMA eql_v2;\n')
  })

  it('returns an empty list when the directory does not exist', async () => {
    const missing = path.join(tmpDir, 'does-not-exist')
    const rewritten = await rewriteEncryptedAlterColumns(missing)
    expect(rewritten).toEqual([])
  })

  it('handles multiple ALTER statements in one file', async () => {
    const original = [
      'ALTER TABLE "a" ALTER COLUMN "x" SET DATA TYPE eql_v2_encrypted;',
      'ALTER TABLE "a" ALTER COLUMN "y" SET DATA TYPE eql_v2_encrypted;',
      'CREATE INDEX "a_z" ON "a" ("z");',
    ].join('\n')
    const filePath = path.join(tmpDir, '0004_multi.sql')
    fs.writeFileSync(filePath, original)

    await rewriteEncryptedAlterColumns(tmpDir)

    const updated = fs.readFileSync(filePath, 'utf-8')
    expect(updated.match(/ADD COLUMN/g)?.length).toBe(2)
    expect(updated.match(/DROP COLUMN/g)?.length).toBe(2)
    // Non-matching statement preserved
    expect(updated).toContain('CREATE INDEX "a_z" ON "a" ("z");')
  })
})
