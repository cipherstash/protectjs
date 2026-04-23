import * as p from '@clack/prompts'
import { fetchIntegrationPrompt } from './agent/fetch-prompt.js'
import { initializeAgent } from './agent/interface.js'
import { checkReadiness } from './health-checks/index.js'
import {
  shutdownAnalytics,
  trackAgentStarted,
  trackFrameworkDetected,
  trackFrameworkSelected,
  trackHealthCheckResult,
  trackPrerequisiteMissing,
  trackWizardCompleted,
  trackWizardError,
  trackWizardStarted,
} from './lib/analytics.js'
import { WizardChangelog } from './lib/changelog.js'
import { INTEGRATIONS } from './lib/constants.js'
import {
  detectIntegration,
  detectPackageManager,
  detectTypeScript,
} from './lib/detect.js'
import { gatherContext } from './lib/gather.js'
import { maybeInstallSkills } from './lib/install-skills.js'
import { runPostAgentSteps } from './lib/post-agent.js'
import { checkPrerequisites } from './lib/prerequisites.js'
import type { Integration, WizardSession } from './lib/types.js'
import { renderCallSiteReport, scanCallSites } from './lib/wire-call-sites.js'

interface RunOptions {
  cwd: string
  debug: boolean
  cliVersion: string
}

export async function run(options: RunOptions) {
  p.intro('CipherStash Wizard')

  const startTime = Date.now()
  const changelog = new WizardChangelog(options.cwd)
  changelog.phase(
    'Session start',
    `cwd: \`${options.cwd}\`\ncli version: \`${options.cliVersion}\``,
  )

  // Phase 1: Prerequisites
  const prereqs = await checkPrerequisites(options.cwd)
  if (!prereqs.ok) {
    trackPrerequisiteMissing(prereqs.missing)
    p.log.error('Missing prerequisites:')
    for (const msg of prereqs.missing) {
      p.log.warn(`  → ${msg}`)
    }
    p.outro('Please complete the steps above and try again.')
    await shutdownAnalytics()
    process.exit(1)
  }

  // Phase 2: Health checks
  const readiness = await checkReadiness()
  trackHealthCheckResult(readiness)
  if (readiness === 'not_ready') {
    trackWizardError('health_check_failed')
    p.log.error(
      'Required services are unreachable. Please check your network and try again.',
    )
    await shutdownAnalytics()
    process.exit(1)
  }
  if (readiness === 'ready_with_warnings') {
    p.log.warn('Some services are degraded — proceeding with caution.')
  }

  // Phase 3: Detect framework
  const s = p.spinner()
  s.start('Detecting project setup...')

  const detectedIntegration = detectIntegration(options.cwd)
  const hasTypeScript = detectTypeScript(options.cwd)
  const packageManager = detectPackageManager(options.cwd)

  s.stop(
    detectedIntegration
      ? `Detected: ${detectedIntegration}${hasTypeScript ? ' (TypeScript)' : ''}`
      : 'No specific framework detected.',
  )

  trackFrameworkDetected(detectedIntegration)

  // Phase 4: Confirm or select integration
  let selectedIntegration: Integration

  if (detectedIntegration) {
    const confirmed = await p.confirm({
      message: `Use ${detectedIntegration} integration?`,
      initialValue: true,
    })

    if (p.isCancel(confirmed)) {
      p.cancel('Cancelled.')
      process.exit(0)
    }

    if (confirmed) {
      selectedIntegration = detectedIntegration
    } else {
      selectedIntegration = await selectIntegration()
    }
  } else {
    selectedIntegration = await selectIntegration()
  }

  trackFrameworkSelected(
    selectedIntegration,
    selectedIntegration === detectedIntegration,
  )
  changelog.phase(
    'Integration selected',
    `\`${selectedIntegration}\` (detected: ${detectedIntegration ?? 'none'})`,
  )

  // Phase 5: Gather context — DB introspection, column selection, schema files
  // All done via CLI prompts BEFORE the agent starts. No AI tokens spent on discovery.
  const gathered = await gatherContext(
    options.cwd,
    selectedIntegration,
    packageManager,
  )

  const encryptedTables = Array.from(
    new Set(gathered.selectedColumns.map((c) => c.tableName)),
  )
  changelog.phase(
    'Columns selected',
    `${gathered.selectedColumns.length} column(s) across ${encryptedTables.length} table(s): ${encryptedTables.map((t) => `\`${t}\``).join(', ')}`,
  )

  // Phase 6: Build session
  const session: WizardSession = {
    cwd: options.cwd,
    debug: options.debug,
    detectedIntegration,
    hasTypeScript,
    detectedPackageManager: packageManager,
    selectedIntegration,
    phase: 'running',
    authenticated: true,
    hasStashConfig: gathered.hasStashConfig,
    hasEqlInstalled: true,
  }

  // Phase 7: Run the agent with a surgical prompt
  trackWizardStarted(session)

  p.log.info('Starting AI agent...')

  try {
    trackAgentStarted(selectedIntegration)

    // Run prompt fetch and agent SDK init concurrently — both are network/IO
    // and they don't depend on each other.
    const [agent, fetched] = await Promise.all([
      initializeAgent(session),
      fetchIntegrationPrompt(gathered, options.cliVersion),
    ])

    if (session.debug) {
      p.log.info(`Prompt length: ${fetched.prompt.length} chars`)
      p.log.info(`Prompt version: ${fetched.promptVersion}`)
    }

    const result = await agent.run(fetched.prompt)

    if (result.success) {
      changelog.phase(
        'Agent completed',
        'Encryption client and schema wiring generated successfully.',
      )

      // Phase 8: Run deterministic post-agent steps (install, push, migrate)
      await runPostAgentSteps({
        cwd: options.cwd,
        integration: selectedIntegration,
        gathered,
      })
      changelog.phase(
        'Post-agent steps complete',
        'Package install, `db install`, `db push`, and migrations finished.',
      )

      // Phase 9: Report call sites that still need encryptModel/decryptModel
      // wiring. Report-only — we don't mutate these files (CIP-2995).
      try {
        const matches = await scanCallSites(
          options.cwd,
          encryptedTables,
          selectedIntegration,
        )
        const report = renderCallSiteReport(matches)
        p.note(report, 'Server action & page call sites')
        changelog.phase('Call-site scan', report)
      } catch (err) {
        p.log.warn(
          `Could not scan for call sites: ${err instanceof Error ? err.message : String(err)}`,
        )
      }

      // Phase 10: Offer to install Claude skills into .claude/skills (CIP-2992).
      const installedSkills = await maybeInstallSkills(
        options.cwd,
        selectedIntegration,
      )
      if (installedSkills.length > 0) {
        changelog.action(
          `Installed ${installedSkills.length} Claude skill(s).`,
          installedSkills.map((name) => `.claude/skills/${name}`),
        )
      }

      trackWizardCompleted(selectedIntegration, Date.now() - startTime)
      const logPath = await changelog.flush()
      if (logPath) {
        p.log.info(`Wizard log written to ${logPath}`)
      }
      p.outro(
        'Encryption is set up! Your data is now protected by CipherStash.',
      )
    } else {
      trackWizardError(result.error ?? 'unknown', selectedIntegration)
      changelog.note(`Agent failed: ${result.error ?? 'unknown error'}`)
      await changelog.flush()
      p.log.error(result.error ?? 'Agent failed without a specific error.')
      p.outro('Wizard could not complete. See above for details.')
      await shutdownAnalytics()
      process.exit(1)
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Agent execution failed.'
    trackWizardError(message, selectedIntegration)
    changelog.note(`Wizard threw: ${message}`)
    await changelog.flush()
    p.log.error(message)
    await shutdownAnalytics()
    process.exit(1)
  }

  await shutdownAnalytics()
}

async function selectIntegration(): Promise<Integration> {
  const selected = await p.select<Integration>({
    message: 'Which integration are you using?',
    options: [
      {
        value: 'drizzle',
        label: 'Drizzle ORM',
        hint: 'modifies your existing schema',
      },
      {
        value: 'supabase',
        label: 'Supabase JS Client',
        hint: 'generates encryption client',
      },
      {
        value: 'prisma',
        label: 'Prisma',
        hint: 'experimental',
      },
      {
        value: 'generic',
        label: 'Raw SQL / Other',
        hint: 'generates encryption client',
      },
    ],
  })

  if (p.isCancel(selected)) {
    p.cancel('Cancelled.')
    process.exit(0)
  }

  return selected
}
