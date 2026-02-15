import * as p from '@clack/prompts'
import type { InitStep, InitState, InitProvider } from '../types.js'
import { CancelledError } from '../types.js'

const REGIONS = [
  { value: 'ap-southeast-2', label: 'Asia Pacific (Sydney)' },
  { value: 'us-east-1', label: 'US East (N. Virginia)' },
  { value: 'us-west-2', label: 'US West (Oregon)' },
  { value: 'eu-west-1', label: 'Europe (Ireland)' },
]

export const selectRegionStep: InitStep = {
  id: 'select-region',
  name: 'Select region',
  async run(state: InitState, _provider: InitProvider): Promise<InitState> {
    const region = await p.select({
      message: 'Where should we create your workspace?',
      options: REGIONS,
    })

    if (p.isCancel(region)) throw new CancelledError()

    return { ...state, region: region as string }
  },
}
