import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('jiti', () => ({
  createJiti: vi.fn(),
}))

describe('loadStashConfig', () => {
  let tmpDir: string
  let originalCwd: () => string

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stash-forge-config-test-'))
    originalCwd = process.cwd
  })

  afterEach(() => {
    process.cwd = originalCwd
    vi.restoreAllMocks()

    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  it('throws when stash.config.ts is missing', async () => {
    process.cwd = () => tmpDir
    vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit')
    })

    const { loadStashConfig } = await import('@/config/index.ts')

    await expect(loadStashConfig()).rejects.toThrow('process.exit')
  })

  it('validates required fields', async () => {
    // Write a config file that exists but exports an empty object
    fs.writeFileSync(path.join(tmpDir, 'stash.config.ts'), 'export default {}')

    process.cwd = () => tmpDir
    vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit')
    })

    const { createJiti } = await import('jiti')
    const mockJiti = {
      import: vi.fn().mockResolvedValue({}),
    }
    vi.mocked(createJiti).mockReturnValue(mockJiti as never)

    const { loadStashConfig } = await import('@/config/index.ts')

    await expect(loadStashConfig()).rejects.toThrow('process.exit')
  })

  it('succeeds with valid config', async () => {
    const validConfig = { databaseUrl: 'postgresql://localhost:5432/test' }

    fs.writeFileSync(
      path.join(tmpDir, 'stash.config.ts'),
      `export default { databaseUrl: 'postgresql://localhost:5432/test' }`,
    )

    process.cwd = () => tmpDir

    const { createJiti } = await import('jiti')
    const mockJiti = {
      import: vi.fn().mockResolvedValue(validConfig),
    }
    vi.mocked(createJiti).mockReturnValue(mockJiti as never)

    const { loadStashConfig } = await import('@/config/index.ts')

    const config = await loadStashConfig()
    expect(config).toEqual({
      ...validConfig,
      client: './src/encryption/index.ts',
    })
  })
})
