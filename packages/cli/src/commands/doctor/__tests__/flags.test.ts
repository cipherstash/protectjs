import { describe, expect, it } from 'vitest'
import { parseDoctorFlags } from '../index.js'

describe('parseDoctorFlags', () => {
  it('coerces boolean flags from the bin parser', () => {
    const flags = parseDoctorFlags(
      { json: true, fix: true, yes: true, verbose: true, 'skip-db': true },
      {},
    )
    expect(flags).toEqual({
      json: true,
      fix: true,
      yes: true,
      verbose: true,
      skipDb: true,
      only: [],
    })
  })

  it('parses a single --only value', () => {
    const flags = parseDoctorFlags({}, { only: 'config' })
    expect(flags.only).toEqual(['config'])
  })

  it('parses a comma-separated --only list', () => {
    const flags = parseDoctorFlags({}, { only: 'project, database' })
    expect(flags.only).toEqual(['project', 'database'])
  })

  it('drops unknown categories from --only', () => {
    const flags = parseDoctorFlags({}, { only: 'project,nonsense' })
    expect(flags.only).toEqual(['project'])
  })

  it('treats missing flags as false and empty only list', () => {
    const flags = parseDoctorFlags({}, {})
    expect(flags).toEqual({
      json: false,
      fix: false,
      yes: false,
      verbose: false,
      skipDb: false,
      only: [],
    })
  })
})
