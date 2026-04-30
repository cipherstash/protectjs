import { describe, expect, it } from 'vitest'
import { classifyError, classifyHttpError } from '../agent/errors.js'

describe('classifyError runner', () => {
  it('uses npx by default for auth failure', () => {
    expect(classifyError('authentication_failed', '')).toContain(
      'Run: npx @cipherstash/cli auth login',
    )
  })

  it('uses bunx when runner=bunx', () => {
    expect(classifyError('authentication_failed', '', 'bunx')).toContain(
      'Run: bunx @cipherstash/cli auth login',
    )
  })

  it('uses pnpm dlx when runner=pnpm dlx', () => {
    expect(classifyError('authentication_failed', '', 'pnpm dlx')).toContain(
      'Run: pnpm dlx @cipherstash/cli auth login',
    )
  })
})

describe('classifyHttpError runner', () => {
  it('uses npx by default for 401', () => {
    expect(classifyHttpError(401, '')).toContain(
      'Run: npx @cipherstash/cli auth login',
    )
  })

  it('uses bunx when runner=bunx for 401', () => {
    expect(classifyHttpError(401, '', 'bunx')).toContain(
      'Run: bunx @cipherstash/cli auth login',
    )
  })
})
