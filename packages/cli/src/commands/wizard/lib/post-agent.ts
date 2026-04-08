/**
 * Post-agent CLI steps.
 *
 * Runs deterministic commands after the agent finishes editing code.
 * These don't need AI — they're fixed commands we can run directly.
 */

import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import * as p from '@clack/prompts'
import type { GatheredContext } from './gather.js'
import type { Integration } from './types.js'

interface PostAgentOptions {
  cwd: string
  integration: Integration
  gathered: GatheredContext
}

/**
 * Run all post-agent steps: install packages, push config, run migrations.
 */
export async function runPostAgentSteps(opts: PostAgentOptions): Promise<void> {
  const { cwd, integration, gathered } = opts

  // Step 1: Install @cipherstash/stack
  await runStep(
    'Installing @cipherstash/stack...',
    'Package installed',
    gathered.installCommand,
    cwd,
  )

  // Step 2: Run stash db setup if needed
  if (!gathered.hasStashConfig) {
    await runStep(
      'Running stash db setup...',
      'stash db setup complete',
      'npx stash db setup',
      cwd,
    )
  }

  // Step 3: Push encryption config
  await runStep(
    'Pushing encryption config to database...',
    'Encryption config pushed',
    'npx stash db push',
    cwd,
  )

  // Step 4: Integration-specific migrations
  if (integration === 'drizzle') {
    await runStep(
      'Generating Drizzle migration...',
      'Migration generated',
      'npx drizzle-kit generate',
      cwd,
    )

    const shouldMigrate = await p.confirm({
      message: 'Run the migration now? (npx drizzle-kit migrate)',
      initialValue: true,
    })

    if (!p.isCancel(shouldMigrate) && shouldMigrate) {
      await runStep(
        'Running migration...',
        'Migration complete',
        'npx drizzle-kit migrate',
        cwd,
      )
    }
  }

  if (integration === 'prisma') {
    const shouldMigrate = await p.confirm({
      message: 'Run Prisma migration now? (npx prisma migrate dev --name add-encryption)',
      initialValue: true,
    })

    if (!p.isCancel(shouldMigrate) && shouldMigrate) {
      await runStep(
        'Running Prisma migration...',
        'Migration complete',
        'npx prisma migrate dev --name add-encryption',
        cwd,
      )
    }
  }
}

async function runStep(
  startMsg: string,
  doneMsg: string,
  command: string,
  cwd: string,
): Promise<void> {
  const s = p.spinner()
  s.start(startMsg)
  try {
    execSync(command, {
      cwd,
      stdio: 'pipe',
      timeout: 120_000,
    })
    s.stop(doneMsg)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    s.stop(`Failed: ${command}`)
    p.log.warn(`Command failed: ${message}`)
    p.log.info(`You can run this manually: ${command}`)
  }
}
