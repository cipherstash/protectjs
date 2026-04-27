import * as p from '@clack/prompts'
import { buildContext } from './context.js'
import { printHuman } from './format/human.js'
import { renderJson } from './format/json.js'
import { CHECKS } from './registry.js'
import { exitCodeForReport, runChecks } from './runner.js'
import type { CheckCategory, DoctorFlags } from './types.js'

const CATEGORIES: ReadonlyArray<CheckCategory> = [
  'project',
  'config',
  'auth',
  'env',
  'database',
  'integration',
]

function isCategory(value: string): value is CheckCategory {
  return (CATEGORIES as ReadonlyArray<string>).includes(value)
}

interface RunDoctorParams {
  flags: DoctorFlags
  cwd: string
  cliVersion: string
}

export async function runDoctor(params: RunDoctorParams): Promise<number> {
  const { flags, cwd, cliVersion } = params

  if (flags.fix) {
    p.log.error(
      'auto-fix is not implemented yet — run the suggested command manually.',
    )
    return 1
  }

  const selected =
    flags.only.length === 0
      ? CHECKS
      : CHECKS.filter((c) => flags.only.includes(c.category))

  const ctx = buildContext({ cwd, cliVersion, flags })

  if (!flags.json) {
    p.intro('stash doctor')
  }

  const report = await runChecks(selected, ctx)

  if (flags.json) {
    console.log(renderJson(report))
  } else {
    printHuman(report, flags.verbose)
  }

  return exitCodeForReport(report)
}

export interface RawDoctorFlags {
  json?: boolean
  fix?: boolean
  yes?: boolean
  verbose?: boolean
  'skip-db'?: boolean
  only?: string
}

export function parseDoctorFlags(
  flags: Record<string, boolean>,
  values: Record<string, string>,
): DoctorFlags {
  const rawOnly = values.only?.trim()
  const only: CheckCategory[] = []
  if (rawOnly) {
    for (const part of rawOnly.split(',')) {
      const trimmed = part.trim()
      if (trimmed && isCategory(trimmed)) {
        only.push(trimmed)
      }
    }
  }
  return {
    json: !!flags.json,
    fix: !!flags.fix,
    yes: !!flags.yes,
    verbose: !!flags.verbose,
    skipDb: !!flags['skip-db'],
    only,
  }
}
