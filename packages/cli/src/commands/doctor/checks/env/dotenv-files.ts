import { existsSync } from 'node:fs'
import path from 'node:path'
import type { Check } from '../../types.js'

const CANDIDATES = [
  '.env',
  '.env.local',
  '.env.development',
  '.env.development.local',
] as const

export const envDotenvFiles: Check = {
  id: 'env.dotenv-files',
  title: 'A .env file is present',
  category: 'env',
  severity: 'info',
  async run({ cwd }) {
    const present = CANDIDATES.filter((file) =>
      existsSync(path.resolve(cwd, file)),
    )
    if (present.length > 0) {
      return { status: 'pass', details: { present: [...present] } }
    }
    return {
      status: 'fail',
      message: 'No .env* files found',
      fixHint:
        'If you set env vars another way (shell, CI), this is informational and safe to ignore.',
    }
  },
}
