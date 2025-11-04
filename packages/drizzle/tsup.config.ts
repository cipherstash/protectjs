import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/pg/index.ts'],
  format: ['cjs', 'esm'],
  sourcemap: true,
  dts: true,
})
