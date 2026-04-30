import { describe, expect, it } from 'vitest'
import { render } from '../helpers/pty.js'

describe('stash auth login — interactive cancel', () => {
  it('shows the region prompt, cancels on ctrl-c, and exits 0', async () => {
    const r = render(['auth', 'login'])

    // First clack prompt — `selectRegion()` runs synchronously before any
    // network activity, so this is a deterministic assertion target.
    await r.waitFor('Select a region')

    r.key('CtrlC')

    const { exitCode } = await r.exit
    expect(exitCode).toBe(0)
    expect(r.output).toContain('Cancelled.')
  })
})
