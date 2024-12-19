import { createDefaultEsmPreset, type JestConfigWithTsJest } from 'ts-jest'

const preset = createDefaultEsmPreset({
  // A separate TypeScript configuration file for Jest.
  tsconfig: './tsconfig.jest.json',
})

const jestConfig: JestConfigWithTsJest = {
  ...preset,
}

export default jestConfig
