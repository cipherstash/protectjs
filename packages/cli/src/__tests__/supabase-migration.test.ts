import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { detectSupabaseProject } from '../commands/db/detect.js'
import {
  chooseSupabaseInstallMode,
  validateInstallFlags,
} from '../commands/db/install.js'
import {
  SUPABASE_EQL_MIGRATION_FILENAME,
  writeSupabaseEqlMigration,
} from '../commands/db/supabase-migration.js'
import { SUPABASE_PERMISSIONS_SQL } from '../installer/index.js'

describe('detectSupabaseProject', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stash-supa-detect-'))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('detects only config.toml', () => {
    fs.mkdirSync(path.join(tmpDir, 'supabase'), { recursive: true })
    fs.writeFileSync(path.join(tmpDir, 'supabase', 'config.toml'), '')

    const info = detectSupabaseProject(tmpDir)
    expect(info.hasConfigToml).toBe(true)
    expect(info.hasMigrationsDir).toBe(false)
    expect(info.migrationsDir).toBe(
      path.resolve(tmpDir, 'supabase', 'migrations'),
    )
  })

  it('detects only the migrations directory', () => {
    fs.mkdirSync(path.join(tmpDir, 'supabase', 'migrations'), {
      recursive: true,
    })

    const info = detectSupabaseProject(tmpDir)
    expect(info.hasConfigToml).toBe(false)
    expect(info.hasMigrationsDir).toBe(true)
  })

  it('detects both config.toml and the migrations directory', () => {
    fs.mkdirSync(path.join(tmpDir, 'supabase', 'migrations'), {
      recursive: true,
    })
    fs.writeFileSync(path.join(tmpDir, 'supabase', 'config.toml'), '')

    const info = detectSupabaseProject(tmpDir)
    expect(info.hasConfigToml).toBe(true)
    expect(info.hasMigrationsDir).toBe(true)
  })

  it('returns false flags when neither marker is present', () => {
    const info = detectSupabaseProject(tmpDir)
    expect(info.hasConfigToml).toBe(false)
    expect(info.hasMigrationsDir).toBe(false)
  })

  it('honors a custom override path (relative + absolute)', () => {
    const customRel = 'db/migrations'
    fs.mkdirSync(path.join(tmpDir, customRel), { recursive: true })

    const relInfo = detectSupabaseProject(tmpDir, customRel)
    expect(relInfo.migrationsDir).toBe(path.resolve(tmpDir, customRel))
    expect(relInfo.hasMigrationsDir).toBe(true)

    const absPath = path.resolve(tmpDir, customRel)
    const absInfo = detectSupabaseProject(tmpDir, absPath)
    expect(absInfo.migrationsDir).toBe(absPath)
    expect(absInfo.hasMigrationsDir).toBe(true)
  })

  it('treats a file at the migrations path as a missing directory', () => {
    fs.mkdirSync(path.join(tmpDir, 'supabase'), { recursive: true })
    fs.writeFileSync(path.join(tmpDir, 'supabase', 'migrations'), 'not a dir')

    const info = detectSupabaseProject(tmpDir)
    expect(info.hasMigrationsDir).toBe(false)
  })
})

describe('writeSupabaseEqlMigration', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stash-supa-write-'))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('writes the file at the well-known filename', async () => {
    const migrationsDir = path.join(tmpDir, 'supabase', 'migrations')

    const result = await writeSupabaseEqlMigration({ migrationsDir })

    expect(path.basename(result.path)).toBe(SUPABASE_EQL_MIGRATION_FILENAME)
    expect(result.overwritten).toBe(false)
    expect(fs.existsSync(result.path)).toBe(true)
  })

  it('writes EQL SQL plus the SUPABASE_PERMISSIONS_SQL block', async () => {
    const migrationsDir = path.join(tmpDir, 'supabase', 'migrations')
    const result = await writeSupabaseEqlMigration({ migrationsDir })

    const contents = fs.readFileSync(result.path, 'utf-8')
    // Header comment block
    expect(contents).toMatch(/^--/)
    expect(contents).toContain('CipherStash')
    // EQL SQL body — the bundled supabase variant defines eql_v2.
    expect(contents).toContain('eql_v2')
    // Permissions block (single source of truth).
    expect(contents).toContain(SUPABASE_PERMISSIONS_SQL.trim())
  })

  it('creates the migrations directory if missing', async () => {
    const migrationsDir = path.join(tmpDir, 'supabase', 'migrations')
    expect(fs.existsSync(migrationsDir)).toBe(false)

    const result = await writeSupabaseEqlMigration({ migrationsDir })

    expect(fs.statSync(migrationsDir).isDirectory()).toBe(true)
    expect(fs.existsSync(result.path)).toBe(true)
  })

  it('throws when the file already exists and force is false', async () => {
    const migrationsDir = path.join(tmpDir, 'supabase', 'migrations')
    fs.mkdirSync(migrationsDir, { recursive: true })
    const existingPath = path.join(
      migrationsDir,
      SUPABASE_EQL_MIGRATION_FILENAME,
    )
    fs.writeFileSync(existingPath, '-- existing')

    await expect(writeSupabaseEqlMigration({ migrationsDir })).rejects.toThrow(
      /already exists/,
    )

    // Existing content untouched
    expect(fs.readFileSync(existingPath, 'utf-8')).toBe('-- existing')
  })

  it('overwrites when force is true', async () => {
    const migrationsDir = path.join(tmpDir, 'supabase', 'migrations')
    fs.mkdirSync(migrationsDir, { recursive: true })
    const existingPath = path.join(
      migrationsDir,
      SUPABASE_EQL_MIGRATION_FILENAME,
    )
    fs.writeFileSync(existingPath, '-- existing')

    const result = await writeSupabaseEqlMigration({
      migrationsDir,
      force: true,
    })

    expect(result.overwritten).toBe(true)
    expect(fs.readFileSync(result.path, 'utf-8')).not.toBe('-- existing')
    expect(fs.readFileSync(result.path, 'utf-8')).toContain('eql_v2')
  })

  it('sorts before realistic Supabase-style migration filenames', () => {
    const filenames = [
      SUPABASE_EQL_MIGRATION_FILENAME,
      '20251015120000_users.sql',
      '99999999999999_other.sql',
    ]
    const sorted = [...filenames].sort()
    expect(sorted[0]).toBe(SUPABASE_EQL_MIGRATION_FILENAME)
  })
})

describe('validateInstallFlags', () => {
  it('returns null for an empty options object', () => {
    expect(validateInstallFlags({})).toBeNull()
  })

  it('returns null when --supabase is paired with --migration', () => {
    expect(validateInstallFlags({ supabase: true, migration: true })).toBeNull()
  })

  it('returns null when --supabase is paired with --direct', () => {
    expect(validateInstallFlags({ supabase: true, direct: true })).toBeNull()
  })

  it('rejects --migration without --supabase', () => {
    const err = validateInstallFlags({ migration: true })
    expect(err).toMatch(/--migration/)
    expect(err).toMatch(/--supabase/)
  })

  it('rejects --direct without --supabase', () => {
    const err = validateInstallFlags({ direct: true })
    expect(err).toMatch(/--direct/)
    expect(err).toMatch(/--supabase/)
  })

  it('rejects --migrations-dir without --supabase', () => {
    const err = validateInstallFlags({ migrationsDir: 'db/migrations' })
    expect(err).toMatch(/--migrations-dir/)
    expect(err).toMatch(/--supabase/)
  })

  it('rejects --migration AND --direct together', () => {
    const err = validateInstallFlags({
      supabase: true,
      migration: true,
      direct: true,
    })
    expect(err).toMatch(/mutually exclusive/i)
  })

  it('does NOT auto-imply --supabase from --migration', () => {
    // Even with --supabase: false explicitly, --migration must error.
    const err = validateInstallFlags({ supabase: false, migration: true })
    expect(err).not.toBeNull()
  })
})

describe('chooseSupabaseInstallMode', () => {
  const projectWith = {
    hasMigrationsDir: true,
    hasConfigToml: true,
    migrationsDir: '/tmp/x',
  }
  const projectWithout = {
    hasMigrationsDir: false,
    hasConfigToml: false,
    migrationsDir: '/tmp/x',
  }

  it('honors explicit --migration regardless of TTY or detection', () => {
    expect(
      chooseSupabaseInstallMode({ migration: true }, projectWithout, true),
    ).toBe('migration')
    expect(
      chooseSupabaseInstallMode({ migration: true }, projectWithout, false),
    ).toBe('migration')
  })

  it('honors explicit --direct regardless of TTY or detection', () => {
    expect(chooseSupabaseInstallMode({ direct: true }, projectWith, true)).toBe(
      'direct',
    )
    expect(
      chooseSupabaseInstallMode({ direct: true }, projectWith, false),
    ).toBe('direct')
  })

  it('returns null in TTY mode when neither sub-flag is set (caller should prompt)', () => {
    expect(chooseSupabaseInstallMode({}, projectWith, true)).toBeNull()
    expect(chooseSupabaseInstallMode({}, projectWithout, true)).toBeNull()
  })

  it('non-interactive: defaults to migration when supabase/migrations exists', () => {
    expect(chooseSupabaseInstallMode({}, projectWith, false)).toBe('migration')
  })

  it('non-interactive: defaults to direct when supabase/migrations is missing', () => {
    expect(chooseSupabaseInstallMode({}, projectWithout, false)).toBe('direct')
  })
})
