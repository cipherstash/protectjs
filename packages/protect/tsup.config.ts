import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts', 'src/identify/index.ts', 'src/dynamodb/index.ts'],
  format: ['cjs', 'esm'],
  sourcemap: true,
  dts: true,
})
