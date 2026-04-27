import { describe, expect, it } from 'vitest'
import { renderHuman } from '../format/human.js'
import type { Report } from '../types.js'

// Strip ANSI escape sequences. We build the regex from a code point to avoid
// embedding a literal control character in source (Biome forbids those inside
// regex literals).
const ESC = String.fromCharCode(0x1b)
const stripAnsi = (s: string): string => {
  let out = ''
  let i = 0
  while (i < s.length) {
    if (s[i] === ESC && s[i + 1] === '[') {
      i += 2
      while (i < s.length && s[i] !== 'm') i++
      i++
    } else {
      out += s[i]
      i++
    }
  }
  return out
}

const REPORT: Report = {
  cliVersion: '1.2.3',
  timestamp: '2026-04-24T14:02:11.482Z',
  summary: { error: 1, warn: 1, info: 0, pass: 1, skip: 1 },
  outcomes: [
    {
      check: {
        id: 'project.package-json',
        title: 'package.json present',
        category: 'project',
        severity: 'error',
        run: async () => ({ status: 'pass' }),
      },
      result: { status: 'pass' },
    },
    {
      check: {
        id: 'project.cli-installed',
        title: 'CLI installed as devDependency',
        category: 'project',
        severity: 'warn',
        run: async () => ({ status: 'fail' }),
      },
      result: {
        status: 'fail',
        message: 'missing',
        fixHint: 'Run: pnpm add -D @cipherstash/cli',
      },
    },
    {
      check: {
        id: 'database.connects',
        title: 'DB connects',
        category: 'database',
        severity: 'error',
        run: async () => ({ status: 'fail' }),
      },
      result: {
        status: 'fail',
        message: 'refused',
        fixHint: 'Check DATABASE_URL',
      },
    },
    {
      check: {
        id: 'database.eql-installed',
        title: 'EQL installed',
        category: 'database',
        severity: 'error',
        run: async () => ({ status: 'skip' }),
      },
      result: {
        status: 'skip',
        message: 'skipped — depends on database.connects',
      },
    },
  ],
}

describe('renderHuman', () => {
  it('includes the fix hint beneath failing checks', () => {
    const output = renderHuman(REPORT)
    expect(output).toContain('Run: pnpm add -D @cipherstash/cli')
    expect(output).toContain('Check DATABASE_URL')
  })

  it('marks passes with a success glyph and failures with a failure glyph', () => {
    const plain = stripAnsi(renderHuman(REPORT))
    expect(plain).toContain('✔ package.json present')
    expect(plain).toContain('✖ DB connects')
    expect(plain).toContain('⚠ CLI installed as devDependency')
    expect(plain).toContain('○ EQL installed')
  })

  it('groups outcomes under a category header', () => {
    const plain = stripAnsi(renderHuman(REPORT))
    expect(plain).toContain('◆ Project')
    expect(plain).toContain('◆ Database')
    expect(plain.indexOf('◆ Project')).toBeLessThan(plain.indexOf('◆ Database'))
  })

  it('prints a summary line with the totals', () => {
    const plain = stripAnsi(renderHuman(REPORT))
    expect(plain).toContain('1 error')
    expect(plain).toContain('1 warning')
    expect(plain).toContain('1 passed')
    expect(plain).toContain('1 skipped')
  })
})
