import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import * as p from '@clack/prompts'
import type { InitProvider, InitState, InitStep } from '../types.js'
import { CancelledError, toIntegration } from '../types.js'
import { generatePlaceholderClient } from '../utils.js'

const DEFAULT_CLIENT_PATH = './src/encryption/index.ts'

export const buildSchemaStep: InitStep = {
  id: 'build-schema',
  name: 'Generate encryption client',
  async run(state: InitState, _provider: InitProvider): Promise<InitState> {
    if (!state.connectionMethod) {
      p.log.warn('Skipping schema generation (no connection method selected)')
      return { ...state, schemaGenerated: false }
    }

    const integration = toIntegration(state.connectionMethod)

    const clientFilePath = await p.text({
      message: 'Where should we create your encryption client?',
      placeholder: DEFAULT_CLIENT_PATH,
      defaultValue: DEFAULT_CLIENT_PATH,
    })

    if (p.isCancel(clientFilePath)) throw new CancelledError()

    const resolvedPath = resolve(process.cwd(), clientFilePath)

    // If the file already exists, ask what to do
    if (existsSync(resolvedPath)) {
      const action = await p.select({
        message: `${clientFilePath} already exists. What would you like to do?`,
        options: [
          {
            value: 'keep',
            label: 'Keep existing file',
            hint: 'skip code generation',
          },
          { value: 'overwrite', label: 'Overwrite with new schema' },
        ],
      })

      if (p.isCancel(action)) throw new CancelledError()

      if (action === 'keep') {
        p.log.info('Keeping existing encryption client file.')
        return { ...state, clientFilePath, schemaGenerated: false }
      }
    }

    const fileContents = generatePlaceholderClient(integration)

    // Write the file
    const dir = dirname(resolvedPath)
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }

    writeFileSync(resolvedPath, fileContents, 'utf-8')
    p.log.success(`Encryption client written to ${clientFilePath}`)

    return { ...state, clientFilePath, schemaGenerated: true }
  },
}
