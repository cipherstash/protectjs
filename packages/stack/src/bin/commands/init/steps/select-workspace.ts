import * as p from '@clack/prompts'
import type { InitStep, InitState, InitProvider } from '../types.js'
import { fetchWorkspaces, createWorkspace } from '../stubs.js'
import { CancelledError } from '../types.js'

export const selectWorkspaceStep: InitStep = {
  id: 'select-workspace',
  name: 'Select workspace',
  async run(state: InitState, _provider: InitProvider): Promise<InitState> {
    const s = p.spinner()
    s.start('Loading workspaces...')
    const workspaces = await fetchWorkspaces(state.accessToken!)
    s.stop('Workspaces loaded')

    const options = [
      ...workspaces.map((ws) => ({ value: ws.id, label: ws.name })),
      { value: '__create__', label: 'Create new workspace' },
    ]

    const selected = await p.select({
      message: 'Select a workspace',
      options,
    })

    if (p.isCancel(selected)) throw new CancelledError()

    if (selected === '__create__') {
      const name = await p.text({
        message: 'What should we call your new workspace?',
        placeholder: 'my-project',
        validate: (val) => {
          if (!val.trim()) return 'Workspace name is required'
        },
      })

      if (p.isCancel(name)) throw new CancelledError()

      const s2 = p.spinner()
      s2.start('Creating workspace...')
      const ws = await createWorkspace(state.accessToken!, name)
      s2.stop(`Workspace created: ${ws.name}`)

      return { ...state, workspaceId: ws.id, workspaceName: ws.name }
    }

    const ws = workspaces.find((w) => w.id === selected)!
    return { ...state, workspaceId: ws.id, workspaceName: ws.name }
  },
}
