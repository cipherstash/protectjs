import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts', 'src/drizzle/index.ts', 'src/identify/index.ts'],
  format: ['cjs', 'esm'],
  sourcemap: true,
  dts: true,
})
