import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/pg/index.ts'],
  outDir: 'dist/pg',
  format: ['cjs', 'esm'],
  sourcemap: true,
  dts: true,
})
