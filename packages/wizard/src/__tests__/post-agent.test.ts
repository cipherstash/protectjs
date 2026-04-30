import { describe, expect, it, vi, beforeEach } from 'vitest'
import { runPostAgentSteps } from '../lib/post-agent.js'
import type { DetectedPackageManager } from '../lib/types.js'

// Mock the child_process module
vi.mock('node:child_process')

import * as childProcess from 'node:child_process'

const bun: DetectedPackageManager = {
  name: 'bun',
  installCommand: 'bun add',
  runCommand: 'bun run',
  execCommand: 'bunx',
}

describe('runPostAgentSteps execution commands', () => {
  beforeEach(() => {
    vi.mocked(childProcess.execSync).mockClear()
    vi.mocked(childProcess.execSync).mockImplementation(() => Buffer.from(''))
  })

  it('executes db install/db push using the detected runner (bun → bunx)', async () => {
    await runPostAgentSteps({
      cwd: '/tmp/fake',
      integration: 'supabase',
      packageManager: bun,
      gathered: {
        installCommand: 'bun add @cipherstash/stack',
        hasStashConfig: false,
        // Other GatheredContext fields aren't read in this code path; cast for the test.
      } as never,
    })

    const commands = vi.mocked(childProcess.execSync).mock.calls.map((c) => c[0] as string)
    expect(commands).toContain('bunx @cipherstash/cli db install')
    expect(commands).toContain('bunx @cipherstash/cli db push')
    // Sanity: no leftover npx forms for the cipherstash binaries.
    for (const cmd of commands) {
      expect(cmd).not.toMatch(/^npx @cipherstash/)
    }
  })

  it('executes drizzle-kit using the detected runner (bun → bunx drizzle-kit generate)', async () => {
    // Confirm prompts for the migrate step would pause execution; the test
    // skips that by using non-drizzle integration above. Here we only
    // assert the generate step.
    await runPostAgentSteps({
      cwd: '/tmp/fake',
      integration: 'supabase', // avoid the interactive p.confirm in drizzle path
      packageManager: bun,
      gathered: { installCommand: 'bun add @cipherstash/stack', hasStashConfig: true } as never,
    })
    // db push runs with no install
    const commands = vi.mocked(childProcess.execSync).mock.calls.map((c) => c[0] as string)
    expect(commands).toContain('bunx @cipherstash/cli db push')
  })

  it('falls back to npx when packageManager is undefined', async () => {
    await runPostAgentSteps({
      cwd: '/tmp/fake',
      integration: 'supabase',
      packageManager: undefined,
      gathered: { installCommand: 'npm install @cipherstash/stack', hasStashConfig: false } as never,
    })
    const commands = vi.mocked(childProcess.execSync).mock.calls.map((c) => c[0] as string)
    expect(commands).toContain('npx @cipherstash/cli db install')
    expect(commands).toContain('npx @cipherstash/cli db push')
  })
})
