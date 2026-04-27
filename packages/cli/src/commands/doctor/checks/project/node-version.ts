import type { Check } from '../../types.js'

const REQUIRED_MAJOR = 22

function parseMajor(version: string): number | undefined {
  const match = version.match(/^v?(\d+)/)
  return match ? Number.parseInt(match[1], 10) : undefined
}

export const projectNodeVersion: Check = {
  id: 'project.node-version',
  title: `Node ${REQUIRED_MAJOR}+`,
  category: 'project',
  severity: 'warn',
  async run() {
    const current = process.versions.node
    const major = parseMajor(current)
    if (major === undefined) {
      return {
        status: 'fail',
        message: `Unable to parse Node version: ${current}`,
      }
    }
    if (major < REQUIRED_MAJOR) {
      return {
        status: 'fail',
        message: `Node ${REQUIRED_MAJOR}+ required; detected ${current}`,
        fixHint: `Upgrade Node to version ${REQUIRED_MAJOR} or later.`,
        details: { required: REQUIRED_MAJOR, current },
      }
    }
    return { status: 'pass', details: { current } }
  },
}
