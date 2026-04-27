import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import type { Check } from '../../types.js'

export const projectPackageJson: Check = {
  id: 'project.package-json',
  title: 'package.json present and parseable',
  category: 'project',
  severity: 'error',
  async run({ cwd }) {
    const pkgPath = path.resolve(cwd, 'package.json')
    if (!existsSync(pkgPath)) {
      return {
        status: 'fail',
        message: 'package.json not found',
        fixHint: 'cd into your project root, or run `npm init` to create one.',
        details: { path: pkgPath },
      }
    }
    try {
      JSON.parse(readFileSync(pkgPath, 'utf-8'))
    } catch (cause) {
      return {
        status: 'fail',
        message: 'package.json is not valid JSON',
        fixHint: 'Fix the JSON syntax errors in package.json.',
        details: { path: pkgPath },
        cause,
      }
    }
    return { status: 'pass', details: { path: pkgPath } }
  },
}
